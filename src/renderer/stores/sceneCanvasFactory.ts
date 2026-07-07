import type {
  Asset,
  IsoDateString,
  PlayerSceneCanvasProjection,
  PlayerSceneCanvasAsset,
  Scene,
  SceneGrid,
  SceneCanvasLayer,
  SceneCanvasLayerKind,
  SceneCanvasMeasurement,
  SceneCanvasObject,
  SceneCanvasObjectTokenState,
  SceneCanvasState,
  SceneCanvasViewport,
} from '@shared/types'

const defaultCanvasWidth = 1600
const defaultCanvasHeight = 900
const defaultCanvasViewport: SceneCanvasViewport = {
  zoom: 1,
  panX: 0,
  panY: 0,
}

const defaultSceneCanvasLayers: SceneCanvasLayer[] = [
  createCanvasLayer('scene-layer-map', 'map', 'Карта', 'player-visible', 0, true),
  createCanvasLayer('scene-layer-grid', 'grid', 'Сетка', 'player-visible', 10, true),
  createCanvasLayer('scene-layer-objects', 'object', 'Объекты', 'player-visible', 20, false),
  createCanvasLayer('scene-layer-tokens', 'token', 'Токены', 'player-visible', 30, false),
  createCanvasLayer('scene-layer-master', 'master', 'Слой мастера', 'master-only', 40, false),
  createCanvasLayer('scene-layer-fog', 'fog', 'Туман войны', 'disabled', 50, true, 0),
]

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

  return {
    width: getPositiveNumber(legacyCanvas.width, defaultCanvasWidth),
    height: getPositiveNumber(legacyCanvas.height, defaultCanvasHeight),
    viewport: normalizeCanvasViewport(legacyCanvas.viewport),
    layers: mergeCanvasLayers(legacyCanvas.layers),
    objects: Array.isArray(legacyCanvas.objects) ? legacyCanvas.objects.map(normalizeCanvasObject) : [],
    measurements: Array.isArray(legacyCanvas.measurements)
      ? legacyCanvas.measurements.map(normalizeCanvasMeasurement)
      : [],
    updatedAt: legacyCanvas.updatedAt ?? new Date().toISOString(),
  }
}

export function createPlayerSceneCanvasProjection(
  scene: Scene,
  assets: Asset[],
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
    viewport: { ...canvas.viewport },
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
    objects: canvas.objects
      .filter((object) => object.isPlayerVisible && playerLayerIds.has(object.layerId))
      .sort(sortObjects)
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
    updatedAt: canvas.updatedAt,
  }
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

  return canvas.layers.sort(sortLayers).map((layer) => ({
    ...layer,
    objectCount: canvas.objects.filter((object) => object.layerId === layer.id).length,
  }))
}

export function createSceneCanvasWithViewport(
  canvas: SceneCanvasState,
  viewport: Partial<SceneCanvasViewport>,
  updatedAt: IsoDateString = new Date().toISOString(),
): SceneCanvasState {
  return {
    ...canvas,
    viewport: normalizeCanvasViewport({
      ...canvas.viewport,
      ...viewport,
    }),
    updatedAt,
  }
}

export function createSceneCanvasWithMeasurement(
  canvas: SceneCanvasState,
  grid: SceneGrid,
  template: 'ruler' | 'circle' | 'cone' | 'square',
  updatedAt: IsoDateString = new Date().toISOString(),
): SceneCanvasState {
  return {
    ...canvas,
    measurements: [...canvas.measurements, createMeasurementTemplate(canvas, grid, template)],
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

export function snapCanvasValue(value: number, grid: SceneGrid): number {
  if (!grid.enabled || !grid.snapToGrid) {
    return value
  }

  return Math.round(value / grid.size) * grid.size
}

export function formatGridDistance(cells: number, grid: SceneGrid): string {
  return `${Math.round(cells * grid.distancePerCell)} ${grid.unitLabel}`
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

function mergeCanvasLayers(layers: SceneCanvasState['layers'] | undefined): SceneCanvasLayer[] {
  if (!Array.isArray(layers)) {
    return defaultSceneCanvasLayers.map((layer) => ({ ...layer }))
  }

  const layersByKind = new Map(layers.map((layer) => [layer.kind, layer]))
  const mergedDefaults = defaultSceneCanvasLayers.map((defaultLayer) => ({
    ...defaultLayer,
    ...layersByKind.get(defaultLayer.kind),
  }))
  const knownKinds = new Set(defaultSceneCanvasLayers.map((layer) => layer.kind))
  const customLayers = layers.filter((layer) => !knownKinds.has(layer.kind)).map((layer) => ({ ...layer }))

  return [...mergedDefaults, ...customLayers].sort(sortLayers)
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

function normalizeCanvasViewport(viewport: Partial<SceneCanvasViewport> | undefined): SceneCanvasViewport {
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

function createMeasurementTemplate(
  canvas: SceneCanvasState,
  grid: SceneGrid,
  template: 'ruler' | 'circle' | 'cone' | 'square',
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
