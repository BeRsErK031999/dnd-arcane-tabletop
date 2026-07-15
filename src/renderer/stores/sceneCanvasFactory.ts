import type {
  Asset,
  IsoDateString,
  PlayerSceneCanvasProjection,
  PlayerSceneCanvasAsset,
  Scene,
  SceneGrid,
  SceneCanvasFogRegion,
  SceneCanvasFogRegionShape,
  SceneCanvasFogState,
  SceneCanvasLayer,
  SceneCanvasLayerKind,
  SceneCanvasMeasurement,
  SceneCanvasObject,
  SceneCanvasObjectTokenState,
  SceneCanvasState,
  SceneCanvasViewport,
} from '@shared/types'

export type SceneCanvasMeasurementTemplate = 'ruler' | 'circle' | 'cone' | 'square'
export const sceneUserLayerOrder = ['map', 'master', 'tokens'] as const
export type SceneUserLayerId = (typeof sceneUserLayerOrder)[number]

export interface SceneUserLayerSummary {
  id: SceneUserLayerId
  label: string
  description: string
  isPlayerVisible: boolean
  objectCount: number
  technicalLayerKinds: SceneCanvasLayerKind[]
}

export interface SceneCanvasMeasurementDraft {
  template: SceneCanvasMeasurementTemplate
  originX: number
  originY: number
  targetX: number
  targetY: number
}

export interface SceneCanvasFogRegionDraft {
  shape: SceneCanvasFogRegionShape
  x: number
  y: number
  width: number
  height: number
}

export type SceneCanvasFogRegionUpdate = Partial<Pick<SceneCanvasFogRegion, 'x' | 'y' | 'width' | 'height'>>

const defaultCanvasWidth = 1600
const defaultCanvasHeight = 900
const defaultCanvasViewport: SceneCanvasViewport = {
  zoom: 1,
  panX: 0,
  panY: 0,
}
const defaultSceneCanvasFog: SceneCanvasFogState = {
  enabled: false,
  opacity: 0.84,
  regions: [],
}

const defaultSceneCanvasLayers: SceneCanvasLayer[] = [
  createCanvasLayer('scene-layer-map', 'map', 'Карта', 'player-visible', 0, true),
  createCanvasLayer('scene-layer-grid', 'grid', 'Сетка', 'player-visible', 10, true),
  createCanvasLayer('scene-layer-objects', 'object', 'Объекты', 'player-visible', 20, false),
  createCanvasLayer('scene-layer-tokens', 'token', 'Токены', 'player-visible', 30, false),
  createCanvasLayer('scene-layer-master', 'master', 'Слой мастера', 'master-only', 40, false),
  createCanvasLayer('scene-layer-fog', 'fog', 'Туман войны', 'disabled', 50, true, 0),
]

const sceneUserLayerTechnicalKinds: Record<SceneUserLayerId, SceneCanvasLayerKind[]> = {
  map: ['map', 'grid', 'object'],
  master: ['master'],
  tokens: ['token'],
}

const sceneUserLayerMetadata: Record<
  SceneUserLayerId,
  Pick<SceneUserLayerSummary, 'description' | 'isPlayerVisible' | 'label'>
> = {
  map: {
    label: 'Карта',
    description: 'Фон и элементы окружения',
    isPlayerVisible: true,
  },
  master: {
    label: 'ГМ',
    description: 'Скрытые материалы мастера',
    isPlayerVisible: false,
  },
  tokens: {
    label: 'Токены',
    description: 'Персонажи и существа',
    isPlayerVisible: true,
  },
}

export function createDefaultSceneCanvas(
  updatedAt: IsoDateString = new Date().toISOString(),
): SceneCanvasState {
  return {
    width: defaultCanvasWidth,
    height: defaultCanvasHeight,
    viewport: { ...defaultCanvasViewport },
    layers: defaultSceneCanvasLayers.map((layer) => ({ ...layer })),
    objects: [],
    measurements: [],
    fog: { ...defaultSceneCanvasFog, regions: [] },
    updatedAt,
  }
}

export function createSceneWithHydratedCanvas(scene: Scene): Scene {
  return {
    ...scene,
    canvas: getSceneCanvasState(scene),
  }
}

export function getSceneCanvasState(scene: Scene): SceneCanvasState {
  const legacyCanvas = (scene as Scene & { canvas?: Partial<SceneCanvasState> }).canvas

  if (!legacyCanvas) {
    return createDefaultSceneCanvas()
  }
  const width = getPositiveNumber(legacyCanvas.width, defaultCanvasWidth)
  const height = getPositiveNumber(legacyCanvas.height, defaultCanvasHeight)
  const fog = normalizeCanvasFog(legacyCanvas.fog, width, height)

  return {
    width,
    height,
    viewport: createHydratedSceneCanvasViewport(legacyCanvas.viewport),
    layers: mergeCanvasLayers(legacyCanvas.layers, fog.enabled),
    objects: Array.isArray(legacyCanvas.objects) ? legacyCanvas.objects.map(normalizeCanvasObject) : [],
    measurements: Array.isArray(legacyCanvas.measurements)
      ? legacyCanvas.measurements.map(normalizeCanvasMeasurement)
      : [],
    fog,
    updatedAt: legacyCanvas.updatedAt ?? new Date().toISOString(),
  }
}

export function createPlayerSceneCanvasProjection(
  scene: Scene,
  assets: Asset[],
  playerViewport?: Partial<SceneCanvasViewport>,
): PlayerSceneCanvasProjection {
  const canvas = getSceneCanvasState(scene)
  const playerLayers = canvas.layers
    .filter((layer) => layer.visibility === 'player-visible')
    .sort(sortLayers)
  const playerLayerIds = new Set(playerLayers.map((layer) => layer.id))
  const backgroundAsset = scene.backgroundAssetId
    ? assets.find((asset) => asset.id === scene.backgroundAssetId)
    : undefined

  return {
    width: canvas.width,
    height: canvas.height,
    viewport: createHydratedSceneCanvasViewport(playerViewport),
    grid: { ...scene.grid },
    backgroundAsset: backgroundAsset
      ? {
          id: backgroundAsset.id,
          name: backgroundAsset.name,
          filePath: backgroundAsset.filePath,
        }
      : undefined,
    layers: playerLayers.map((layer) => ({
      id: layer.id,
      kind: layer.kind,
      name: layer.name,
      zIndex: layer.zIndex,
      opacity: layer.opacity,
    })),
    objects: getSceneCanvasObjectsInRenderOrder(canvas)
      .filter((object) => object.isPlayerVisible && playerLayerIds.has(object.layerId))
      .map(({ id, kind, name, x, y, width, height, rotation, color, text, assetId }) => {
        const objectAsset = assetId ? assets.find((asset) => asset.id === assetId) : undefined

        return {
          id,
          kind,
          name,
          x,
          y,
          width,
          height,
          rotation,
          color,
          text,
          assetId,
          asset: objectAsset ? createPlayerSceneCanvasAsset(objectAsset) : undefined,
        }
      }),
    measurements: canvas.measurements
      .filter((measurement) => measurement.isPlayerVisible)
      .map(({ id, kind, shape, name, originX, originY, targetX, targetY, radius, color, label }) => ({
        id,
        kind,
        shape,
        name,
        originX,
        originY,
        targetX,
        targetY,
        radius,
        color,
        label,
      })),
    fog: {
      enabled: canvas.fog.enabled,
      opacity: canvas.fog.opacity,
      regions: canvas.fog.enabled
        ? canvas.fog.regions.map(({ id, shape, x, y, width, height }) => ({
            id,
            shape,
            x,
            y,
            width,
            height,
          }))
        : [],
    },
    updatedAt: canvas.updatedAt,
  }
}

export function getSceneUserLayerForLayerKind(kind: SceneCanvasLayerKind): SceneUserLayerId | null {
  switch (kind) {
    case 'map':
    case 'grid':
    case 'object':
      return 'map'
    case 'master':
      return 'master'
    case 'token':
      return 'tokens'
    case 'fog':
      return null
  }
}

export function getSceneUserLayerForObject(
  canvas: Pick<SceneCanvasState, 'layers'>,
  object: Pick<SceneCanvasObject, 'layerId'>,
): SceneUserLayerId {
  const technicalLayer = canvas.layers.find((layer) => layer.id === object.layerId)

  return technicalLayer ? getSceneUserLayerForLayerKind(technicalLayer.kind) ?? 'map' : 'map'
}

export function isSceneCanvasObjectInUserLayer(
  canvas: Pick<SceneCanvasState, 'layers'>,
  object: Pick<SceneCanvasObject, 'layerId'>,
  userLayer: SceneUserLayerId,
): boolean {
  return getSceneUserLayerForObject(canvas, object) === userLayer
}

export function getSceneUserLayerOpacity(
  userLayer: SceneUserLayerId,
  activeUserLayer: SceneUserLayerId,
  baseOpacity = 1,
): number {
  return userLayer === 'master' && activeUserLayer !== 'master' ? baseOpacity * 0.5 : baseOpacity
}

export function getSceneCanvasObjectsInRenderOrder(canvas: SceneCanvasState): SceneCanvasObject[] {
  const userLayerRanks = new Map(sceneUserLayerOrder.map((userLayer, index) => [userLayer, index]))
  const technicalLayerRanks = new Map(canvas.layers.map((layer) => [layer.id, layer.zIndex]))

  return [...canvas.objects].sort((left, right) => {
    const leftUserLayerRank = userLayerRanks.get(getSceneUserLayerForObject(canvas, left)) ?? 0
    const rightUserLayerRank = userLayerRanks.get(getSceneUserLayerForObject(canvas, right)) ?? 0

    return (
      leftUserLayerRank - rightUserLayerRank ||
      (technicalLayerRanks.get(left.layerId) ?? 0) - (technicalLayerRanks.get(right.layerId) ?? 0) ||
      sortObjects(left, right)
    )
  })
}

export function getSceneUserLayerSummary(scene: Scene): SceneUserLayerSummary[] {
  const canvas = getSceneCanvasState(scene)

  return sceneUserLayerOrder.map((id) => ({
    id,
    ...sceneUserLayerMetadata[id],
    objectCount:
      canvas.objects.filter((object) => isSceneCanvasObjectInUserLayer(canvas, object, id)).length +
      (id === 'map' && scene.backgroundAssetId ? 1 : 0),
    technicalLayerKinds: [...sceneUserLayerTechnicalKinds[id]],
  }))
}

function createPlayerSceneCanvasAsset(asset: Asset): PlayerSceneCanvasAsset {
  return {
    id: asset.id,
    name: asset.name,
    filePath: asset.filePath,
  }
}

export function getSceneCanvasLayerSummary(scene: Scene): Array<SceneCanvasLayer & { objectCount: number }> {
  const canvas = getSceneCanvasState(scene)

  return [...canvas.layers].sort(sortLayers).map((layer) => ({
    ...layer,
    objectCount:
      layer.kind === 'fog'
        ? canvas.fog.regions.length
        : canvas.objects.filter((object) => object.layerId === layer.id).length,
  }))
}

export function createSceneCanvasWithViewport(
  canvas: SceneCanvasState,
  viewport: Partial<SceneCanvasViewport>,
  updatedAt: IsoDateString = new Date().toISOString(),
): SceneCanvasState {
  return {
    ...canvas,
    viewport: createHydratedSceneCanvasViewport({
      ...canvas.viewport,
      ...viewport,
    }),
    updatedAt,
  }
}

export function createSceneCanvasWithMeasurement(
  canvas: SceneCanvasState,
  grid: SceneGrid,
  input: SceneCanvasMeasurementTemplate | SceneCanvasMeasurementDraft,
  updatedAt: IsoDateString = new Date().toISOString(),
): SceneCanvasState {
  return {
    ...canvas,
    measurements: [...canvas.measurements, createMeasurementFromInput(canvas, grid, input)],
    updatedAt,
  }
}

export function createSceneCanvasWithoutMeasurements(
  canvas: SceneCanvasState,
  updatedAt: IsoDateString = new Date().toISOString(),
): SceneCanvasState {
  return {
    ...canvas,
    measurements: [],
    updatedAt,
  }
}

export function createSceneCanvasWithFogSettings(
  canvas: SceneCanvasState,
  fogSettings: Partial<Pick<SceneCanvasFogState, 'enabled' | 'opacity'>>,
  updatedAt: IsoDateString = new Date().toISOString(),
): SceneCanvasState {
  const fog = normalizeCanvasFog(
    {
      ...canvas.fog,
      ...fogSettings,
    },
    canvas.width,
    canvas.height,
  )

  return {
    ...canvas,
    layers: mergeCanvasLayers(canvas.layers, fog.enabled),
    fog,
    updatedAt,
  }
}

export function createSceneCanvasWithFogRegion(
  canvas: SceneCanvasState,
  grid: SceneGrid,
  input: SceneCanvasFogRegionShape | SceneCanvasFogRegionDraft,
  updatedAt: IsoDateString = new Date().toISOString(),
): SceneCanvasState {
  const region = createFogRegionFromInput(canvas, grid, input, canvas.fog.regions.length + 1)
  const fog = normalizeCanvasFog(
    {
      ...canvas.fog,
      enabled: true,
      regions: [...canvas.fog.regions, region],
    },
    canvas.width,
    canvas.height,
  )

  return {
    ...canvas,
    layers: mergeCanvasLayers(canvas.layers, true),
    fog,
    updatedAt,
  }
}

export function createSceneCanvasWithUpdatedFogRegion(
  canvas: SceneCanvasState,
  grid: SceneGrid,
  regionId: SceneCanvasFogRegion['id'],
  regionUpdate: SceneCanvasFogRegionUpdate,
  updatedAt: IsoDateString = new Date().toISOString(),
): SceneCanvasState {
  const currentRegion = canvas.fog.regions.find((region) => region.id === regionId)

  if (!currentRegion) {
    throw new Error('fog-region-not-found')
  }

  const updatedRegion = normalizeCanvasFogRegion(
    snapFogRegionToGrid(
      {
        ...currentRegion,
        ...regionUpdate,
      },
      grid,
    ),
    canvas.width,
    canvas.height,
    canvas.fog.regions.findIndex((region) => region.id === regionId),
  )
  const fog = normalizeCanvasFog(
    {
      ...canvas.fog,
      enabled: true,
      regions: canvas.fog.regions.map((region) => (region.id === regionId ? updatedRegion : region)),
    },
    canvas.width,
    canvas.height,
  )

  return {
    ...canvas,
    layers: mergeCanvasLayers(canvas.layers, true),
    fog,
    updatedAt,
  }
}

export function createSceneCanvasWithoutLastFogRegion(
  canvas: SceneCanvasState,
  updatedAt: IsoDateString = new Date().toISOString(),
): SceneCanvasState {
  const regions = canvas.fog.regions.slice(0, -1)
  const fog = normalizeCanvasFog(
    {
      ...canvas.fog,
      enabled: regions.length > 0 && canvas.fog.enabled,
      regions,
    },
    canvas.width,
    canvas.height,
  )

  return {
    ...canvas,
    layers: mergeCanvasLayers(canvas.layers, fog.enabled),
    fog,
    updatedAt,
  }
}

export function createSceneCanvasWithoutFogRegions(
  canvas: SceneCanvasState,
  updatedAt: IsoDateString = new Date().toISOString(),
): SceneCanvasState {
  const fog = normalizeCanvasFog(
    {
      ...canvas.fog,
      enabled: false,
      regions: [],
    },
    canvas.width,
    canvas.height,
  )

  return {
    ...canvas,
    layers: mergeCanvasLayers(canvas.layers, false),
    fog,
    updatedAt,
  }
}

export function snapCanvasValue(value: number, grid: SceneGrid): number {
  if (!grid.enabled || !grid.snapToGrid) {
    return value
  }

  return Math.round(value / grid.size) * grid.size
}

export function formatGridDistance(cells: number, grid: SceneGrid): string {
  return `${formatDistanceValue(cells * grid.distancePerCell)} ${grid.unitLabel}`
}

function createCanvasLayer(
  id: string,
  kind: SceneCanvasLayerKind,
  name: string,
  visibility: SceneCanvasLayer['visibility'],
  zIndex: number,
  locked: boolean,
  opacity = 1,
): SceneCanvasLayer {
  return {
    id,
    kind,
    name,
    visibility,
    zIndex,
    opacity,
    locked,
  }
}

function mergeCanvasLayers(layers: SceneCanvasState['layers'] | undefined, isFogEnabled = false): SceneCanvasLayer[] {
  if (!Array.isArray(layers)) {
    return defaultSceneCanvasLayers.map((layer) => normalizeCanvasLayer(layer, isFogEnabled))
  }

  const layersByKind = new Map(layers.map((layer) => [layer.kind, layer]))
  const mergedDefaults = defaultSceneCanvasLayers.map((defaultLayer) => ({
    ...defaultLayer,
    ...layersByKind.get(defaultLayer.kind),
  })).map((layer) => normalizeCanvasLayer(layer, isFogEnabled))
  const knownKinds = new Set(defaultSceneCanvasLayers.map((layer) => layer.kind))
  const customLayers = layers.filter((layer) => !knownKinds.has(layer.kind)).map((layer) => ({ ...layer }))

  return [...mergedDefaults, ...customLayers].sort(sortLayers)
}

function normalizeCanvasLayer(layer: SceneCanvasLayer, isFogEnabled: boolean): SceneCanvasLayer {
  if (layer.kind !== 'fog') {
    return { ...layer }
  }

  return {
    ...layer,
    visibility: isFogEnabled ? 'player-visible' : 'disabled',
  }
}

function normalizeCanvasObject(object: SceneCanvasObject): SceneCanvasObject {
  return {
    ...object,
    x: getFiniteNumber(object.x, 0),
    y: getFiniteNumber(object.y, 0),
    width: getPositiveNumber(object.width, 120),
    height: getPositiveNumber(object.height, 80),
    rotation: getFiniteNumber(object.rotation, 0),
    tokenState: normalizeCanvasObjectTokenState(object.tokenState),
    isPlayerVisible: Boolean(object.isPlayerVisible),
  }
}

function normalizeCanvasObjectTokenState(
  tokenState: SceneCanvasObjectTokenState | undefined,
): SceneCanvasObjectTokenState | undefined {
  if (!tokenState) {
    return undefined
  }

  const note = tokenState.note?.trim()
  const normalizedState: SceneCanvasObjectTokenState = {
    characterCardId: tokenState.characterCardId,
    hitPoints: getOptionalPositiveInteger(tokenState.hitPoints),
    armorClass: getOptionalPositiveInteger(tokenState.armorClass),
    note: note === '' ? undefined : note,
  }

  return Object.values(normalizedState).some((value) => value !== undefined) ? normalizedState : undefined
}

export function createHydratedSceneCanvasViewport(
  viewport?: Partial<SceneCanvasViewport>,
): SceneCanvasViewport {
  return {
    zoom: clampNumber(viewport?.zoom, 0.5, 3, defaultCanvasViewport.zoom),
    panX: clampNumber(viewport?.panX, -800, 800, defaultCanvasViewport.panX),
    panY: clampNumber(viewport?.panY, -800, 800, defaultCanvasViewport.panY),
  }
}

function normalizeCanvasMeasurement(measurement: SceneCanvasMeasurement): SceneCanvasMeasurement {
  return {
    ...measurement,
    originX: getFiniteNumber(measurement.originX, defaultCanvasWidth / 2),
    originY: getFiniteNumber(measurement.originY, defaultCanvasHeight / 2),
    targetX: getFiniteNumber(measurement.targetX, defaultCanvasWidth / 2),
    targetY: getFiniteNumber(measurement.targetY, defaultCanvasHeight / 2),
    radius: getPositiveNumber(measurement.radius, 140),
    isPlayerVisible: Boolean(measurement.isPlayerVisible),
  }
}

function normalizeCanvasFog(
  fog: Partial<SceneCanvasFogState> | undefined,
  canvasWidth: number,
  canvasHeight: number,
): SceneCanvasFogState {
  const regions = Array.isArray(fog?.regions)
    ? fog.regions.map((region, index) => normalizeCanvasFogRegion(region, canvasWidth, canvasHeight, index))
    : []

  return {
    enabled: Boolean(fog?.enabled),
    opacity: clampNumber(fog?.opacity, 0.25, 0.96, defaultSceneCanvasFog.opacity),
    regions,
  }
}

function normalizeCanvasFogRegion(
  region: Partial<SceneCanvasFogRegion>,
  canvasWidth: number,
  canvasHeight: number,
  index: number,
): SceneCanvasFogRegion {
  const fallbackWidth = Math.min(280, canvasWidth)
  const fallbackHeight = Math.min(210, canvasHeight)
  const width = clampNumber(region.width, 40, canvasWidth, fallbackWidth)
  const height = clampNumber(region.height, 40, canvasHeight, fallbackHeight)
  const x = clampNumber(region.x, 0, Math.max(0, canvasWidth - width), Math.max(0, canvasWidth / 2 - width / 2))
  const y = clampNumber(region.y, 0, Math.max(0, canvasHeight - height), Math.max(0, canvasHeight / 2 - height / 2))
  const label = region.label?.trim()

  return {
    id: region.id ?? createFogRegionId(),
    shape: region.shape === 'circle' ? 'circle' : 'rectangle',
    label: label || `Туман ${index + 1}`,
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}

function createFogRegionTemplate(
  canvas: SceneCanvasState,
  grid: SceneGrid,
  shape: SceneCanvasFogRegionShape,
  number: number,
): SceneCanvasFogRegion {
  const baseSize = grid.enabled ? grid.size : 70
  const width = shape === 'circle' ? baseSize * 4 : baseSize * 5
  const height = shape === 'circle' ? baseSize * 4 : baseSize * 3
  const x = snapCanvasValue(canvas.width / 2 - width / 2, grid)
  const y = snapCanvasValue(canvas.height / 2 - height / 2, grid)

  return normalizeCanvasFogRegion(
    {
      id: createFogRegionId(),
      shape,
      label: shape === 'circle' ? `Круг тумана ${number}` : `Область тумана ${number}`,
      x,
      y,
      width,
      height,
    },
    canvas.width,
    canvas.height,
    number - 1,
  )
}

function createFogRegionFromInput(
  canvas: SceneCanvasState,
  grid: SceneGrid,
  input: SceneCanvasFogRegionShape | SceneCanvasFogRegionDraft,
  number: number,
): SceneCanvasFogRegion {
  if (typeof input === 'string') {
    return createFogRegionTemplate(canvas, grid, input, number)
  }

  return normalizeCanvasFogRegion(
    {
      ...snapFogRegionToGrid(input, grid),
      id: createFogRegionId(),
      label: input.shape === 'circle' ? `Круг тумана ${number}` : `Область тумана ${number}`,
    },
    canvas.width,
    canvas.height,
    number - 1,
  )
}

function snapFogRegionToGrid<T extends Pick<SceneCanvasFogRegion, 'x' | 'y' | 'width' | 'height'>>(
  region: T,
  grid: SceneGrid,
): T {
  if (!grid.enabled || !grid.snapToGrid) {
    return region
  }

  return {
    ...region,
    x: snapCanvasValue(region.x, grid),
    y: snapCanvasValue(region.y, grid),
    width: snapCanvasDimension(region.width, grid),
    height: snapCanvasDimension(region.height, grid),
  }
}

function snapCanvasDimension(value: number, grid: SceneGrid): number {
  return Math.max(grid.size, snapCanvasValue(value, grid))
}

function createMeasurementTemplate(
  canvas: SceneCanvasState,
  grid: SceneGrid,
  template: SceneCanvasMeasurementTemplate,
): SceneCanvasMeasurement {
  const centerX = snapCanvasValue(canvas.width / 2, grid)
  const centerY = snapCanvasValue(canvas.height / 2, grid)
  const rulerLength = grid.size * 6
  const areaRadius = grid.size * 4

  switch (template) {
    case 'ruler':
      return createMeasurement({
        kind: 'ruler',
        name: 'Линейка',
        originX: centerX - rulerLength / 2,
        originY: centerY,
        targetX: centerX + rulerLength / 2,
        targetY: centerY,
        radius: 0,
        color: '#2c806f',
        label: formatGridDistance(6, grid),
      })
    case 'circle':
      return createMeasurement({
        kind: 'area',
        shape: 'circle',
        name: 'Круг',
        originX: centerX,
        originY: centerY,
        targetX: centerX,
        targetY: centerY,
        radius: areaRadius,
        color: '#9f2d3c',
        label: formatGridDistance(4, grid),
      })
    case 'cone':
      return createMeasurement({
        kind: 'area',
        shape: 'cone',
        name: 'Конус',
        originX: centerX,
        originY: centerY,
        targetX: centerX + areaRadius,
        targetY: centerY - areaRadius,
        radius: areaRadius,
        color: '#d8a86a',
        label: formatGridDistance(4, grid),
      })
    case 'square':
      return createMeasurement({
        kind: 'area',
        shape: 'square',
        name: 'Квадрат',
        originX: centerX,
        originY: centerY,
        targetX: centerX,
        targetY: centerY,
        radius: areaRadius,
        color: '#49625f',
        label: formatGridDistance(4, grid),
      })
  }
}

function createMeasurementFromInput(
  canvas: SceneCanvasState,
  grid: SceneGrid,
  input: SceneCanvasMeasurementTemplate | SceneCanvasMeasurementDraft,
): SceneCanvasMeasurement {
  if (typeof input === 'string') {
    return createMeasurementTemplate(canvas, grid, input)
  }

  const originX = getSnappedCanvasCoordinate(input.originX, grid, canvas.width)
  const originY = getSnappedCanvasCoordinate(input.originY, grid, canvas.height)
  const targetX = getSnappedCanvasCoordinate(input.targetX, grid, canvas.width)
  const targetY = getSnappedCanvasCoordinate(input.targetY, grid, canvas.height)
  const radius = Math.max(grid.size / 2, Math.hypot(targetX - originX, targetY - originY))
  const cells = input.template === 'ruler' ? Math.hypot(targetX - originX, targetY - originY) / grid.size : radius / grid.size

  switch (input.template) {
    case 'ruler':
      return createMeasurement({
        kind: 'ruler',
        name: 'Линейка',
        originX,
        originY,
        targetX,
        targetY,
        radius: 0,
        color: '#2c806f',
        label: formatGridDistance(cells, grid),
      })
    case 'circle':
      return createMeasurement({
        kind: 'area',
        shape: 'circle',
        name: 'Круг',
        originX,
        originY,
        targetX,
        targetY,
        radius,
        color: '#9f2d3c',
        label: formatGridDistance(cells, grid),
      })
    case 'cone':
      return createMeasurement({
        kind: 'area',
        shape: 'cone',
        name: 'Конус',
        originX,
        originY,
        targetX,
        targetY,
        radius,
        color: '#d8a86a',
        label: formatGridDistance(cells, grid),
      })
    case 'square':
      return createMeasurement({
        kind: 'area',
        shape: 'square',
        name: 'Квадрат',
        originX,
        originY,
        targetX,
        targetY,
        radius,
        color: '#49625f',
        label: formatGridDistance(cells, grid),
      })
  }
}

function createMeasurement(
  measurement: Omit<SceneCanvasMeasurement, 'id' | 'isPlayerVisible'>,
): SceneCanvasMeasurement {
  return {
    id: createMeasurementId(),
    isPlayerVisible: true,
    ...measurement,
  }
}

function createMeasurementId(): string {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return `measurement-${randomId}`
  }

  return `measurement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createFogRegionId(): string {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return `fog-${randomId}`
  }

  return `fog-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function getSnappedCanvasCoordinate(value: number, grid: SceneGrid, max: number): number {
  const finiteValue = getFiniteNumber(value, 0)
  const snappedValue = grid.enabled && grid.snapToGrid ? snapCanvasValue(finiteValue, grid) : finiteValue

  return clampNumber(snappedValue, 0, max, 0)
}

function formatDistanceValue(value: number): string {
  const roundedValue = Math.round(value * 10) / 10

  if (Number.isInteger(roundedValue)) {
    return String(roundedValue)
  }

  return roundedValue.toFixed(1)
}

function getFiniteNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback
}

function getPositiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback
}

function getOptionalPositiveInteger(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined
  }

  return Math.max(0, Math.round(Number(value)))
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(Math.max(Number(value), min), max)
}

function sortLayers(left: SceneCanvasLayer, right: SceneCanvasLayer): number {
  return left.zIndex - right.zIndex
}

function sortObjects(left: SceneCanvasObject, right: SceneCanvasObject): number {
  return left.y - right.y || left.x - right.x
}
