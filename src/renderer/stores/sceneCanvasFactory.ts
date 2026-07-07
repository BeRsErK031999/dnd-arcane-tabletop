import type {
  Asset,
  IsoDateString,
  PlayerSceneCanvasProjection,
  Scene,
  SceneCanvasLayer,
  SceneCanvasLayerKind,
  SceneCanvasObject,
  SceneCanvasState,
} from '@shared/types'

const defaultCanvasWidth = 1600
const defaultCanvasHeight = 900

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
    layers: defaultSceneCanvasLayers.map((layer) => ({ ...layer })),
    objects: [],
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
    layers: mergeCanvasLayers(legacyCanvas.layers),
    objects: Array.isArray(legacyCanvas.objects) ? legacyCanvas.objects.map(normalizeCanvasObject) : [],
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
      .map(({ id, kind, name, x, y, width, height, rotation, color, text, assetId }) => ({
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
      })),
    updatedAt: canvas.updatedAt,
  }
}

export function getSceneCanvasLayerSummary(scene: Scene): Array<SceneCanvasLayer & { objectCount: number }> {
  const canvas = getSceneCanvasState(scene)

  return canvas.layers.sort(sortLayers).map((layer) => ({
    ...layer,
    objectCount: canvas.objects.filter((object) => object.layerId === layer.id).length,
  }))
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
    isPlayerVisible: Boolean(object.isPlayerVisible),
  }
}

function getFiniteNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback
}

function getPositiveNumber(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback
}

function sortLayers(left: SceneCanvasLayer, right: SceneCanvasLayer): number {
  return left.zIndex - right.zIndex
}

function sortObjects(left: SceneCanvasObject, right: SceneCanvasObject): number {
  return left.y - right.y || left.x - right.x
}
