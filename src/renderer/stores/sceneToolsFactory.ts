import type {
  Campaign,
  IsoDateString,
  Scene,
  SceneCanvasFogRegionShape,
  SceneCanvasFogState,
  SceneCanvasObject,
  SceneCanvasObjectId,
  SceneCanvasObjectTokenState,
  SceneCanvasViewport,
  SceneGrid,
} from '@shared/types'
import {
  createSceneCanvasWithFogRegion,
  createSceneCanvasWithFogSettings,
  createSceneCanvasWithMeasurement,
  createSceneCanvasWithoutMeasurements,
  createSceneCanvasWithoutFogRegions,
  createSceneCanvasWithoutLastFogRegion,
  createSceneCanvasWithViewport,
  getSceneCanvasState,
  snapCanvasValue,
} from './sceneCanvasFactory'
import {
  createCampaignWithHydratedScenes,
  createHydratedSceneGrid,
  getActiveCampaignScene,
} from './sceneFactory'

export type SceneMeasurementTemplate = 'ruler' | 'circle' | 'cone' | 'square'
export type SceneObjectMoveDirection = 'up' | 'down' | 'left' | 'right'
export type SceneFogRegionTemplate = SceneCanvasFogRegionShape

export function createCampaignWithActiveSceneGrid(
  campaign: Campaign,
  grid: Partial<SceneGrid>,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => ({
    ...scene,
    grid: createHydratedSceneGrid({
      ...scene.grid,
      ...grid,
    }),
  }))
}

export function createCampaignWithActiveSceneViewport(
  campaign: Campaign,
  viewport: Partial<SceneCanvasViewport>,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => ({
    ...scene,
    canvas: createSceneCanvasWithViewport(getSceneCanvasState(scene), viewport, updatedAt),
  }))
}

export function createCampaignWithActiveSceneMeasurement(
  campaign: Campaign,
  template: SceneMeasurementTemplate,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => ({
    ...scene,
    canvas: createSceneCanvasWithMeasurement(getSceneCanvasState(scene), scene.grid, template, updatedAt),
  }))
}

export function createCampaignWithoutActiveSceneMeasurements(
  campaign: Campaign,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => ({
    ...scene,
    canvas: createSceneCanvasWithoutMeasurements(getSceneCanvasState(scene), updatedAt),
  }))
}

export function createCampaignWithActiveSceneFog(
  campaign: Campaign,
  fog: Partial<Pick<SceneCanvasFogState, 'enabled' | 'opacity'>>,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => ({
    ...scene,
    canvas: createSceneCanvasWithFogSettings(getSceneCanvasState(scene), fog, updatedAt),
  }))
}

export function createCampaignWithActiveSceneFogRegion(
  campaign: Campaign,
  shape: SceneFogRegionTemplate,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => ({
    ...scene,
    canvas: createSceneCanvasWithFogRegion(getSceneCanvasState(scene), scene.grid, shape, updatedAt),
  }))
}

export function createCampaignWithoutLastActiveSceneFogRegion(
  campaign: Campaign,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => ({
    ...scene,
    canvas: createSceneCanvasWithoutLastFogRegion(getSceneCanvasState(scene), updatedAt),
  }))
}

export function createCampaignWithoutActiveSceneFogRegions(
  campaign: Campaign,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => ({
    ...scene,
    canvas: createSceneCanvasWithoutFogRegions(getSceneCanvasState(scene), updatedAt),
  }))
}

export function createCampaignWithMovedActiveSceneObject(
  campaign: Campaign,
  objectId: SceneCanvasObjectId,
  direction: SceneObjectMoveDirection,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => ({
    ...scene,
    canvas: createCanvasWithUpdatedObject(scene, objectId, updatedAt, (object, canvas) =>
      moveCanvasObject(object, scene.grid, canvas.width, canvas.height, direction),
    ),
  }))
}

export function createCampaignWithDuplicatedActiveSceneObject(
  campaign: Campaign,
  objectId: SceneCanvasObjectId,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => {
    const canvas = getSceneCanvasState(scene)
    const sourceObject = findCanvasObjectOrThrow(canvas.objects, objectId)
    const offset = getObjectMoveStep(scene.grid)
    const duplicatedObject: SceneCanvasObject = {
      ...sourceObject,
      id: createSceneCanvasObjectId(),
      name: `${sourceObject.name} copy`,
      text: sourceObject.text ? `${sourceObject.text} copy` : undefined,
      x: clampCanvasValue(sourceObject.x + offset, 0, canvas.width - sourceObject.width),
      y: clampCanvasValue(sourceObject.y + offset, 0, canvas.height - sourceObject.height),
      tokenState: sourceObject.tokenState ? { ...sourceObject.tokenState } : undefined,
    }

    return {
      ...scene,
      canvas: {
        ...canvas,
        objects: [...canvas.objects, duplicatedObject],
        updatedAt,
      },
    }
  })
}

export function createCampaignWithActiveSceneObjectVisibility(
  campaign: Campaign,
  objectId: SceneCanvasObjectId,
  isPlayerVisible: boolean,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => ({
    ...scene,
    canvas: createCanvasWithUpdatedObject(scene, objectId, updatedAt, (object) => ({
      ...object,
      isPlayerVisible,
    })),
  }))
}

export function createCampaignWithActiveSceneObjectTokenState(
  campaign: Campaign,
  objectId: SceneCanvasObjectId,
  tokenState: SceneCanvasObjectTokenState,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  return updateActiveScene(campaign, updatedAt, (scene) => ({
    ...scene,
    canvas: createCanvasWithUpdatedObject(scene, objectId, updatedAt, (object) => ({
      ...object,
      tokenState: normalizeTokenState({
        ...object.tokenState,
        ...tokenState,
      }),
    })),
  }))
}

function createCanvasWithUpdatedObject(
  scene: Scene,
  objectId: SceneCanvasObjectId,
  updatedAt: IsoDateString,
  updateObject: (object: SceneCanvasObject, canvas: ReturnType<typeof getSceneCanvasState>) => SceneCanvasObject,
) {
  const canvas = getSceneCanvasState(scene)
  findCanvasObjectOrThrow(canvas.objects, objectId)

  return {
    ...canvas,
    objects: canvas.objects.map((object) => (object.id === objectId ? updateObject(object, canvas) : object)),
    updatedAt,
  }
}

function moveCanvasObject(
  object: SceneCanvasObject,
  grid: SceneGrid,
  canvasWidth: number,
  canvasHeight: number,
  direction: SceneObjectMoveDirection,
): SceneCanvasObject {
  const step = getObjectMoveStep(grid)
  const deltaByDirection: Record<SceneObjectMoveDirection, { x: number; y: number }> = {
    up: { x: 0, y: -step },
    down: { x: 0, y: step },
    left: { x: -step, y: 0 },
    right: { x: step, y: 0 },
  }
  const delta = deltaByDirection[direction]
  const rawX = object.x + delta.x
  const rawY = object.y + delta.y
  const nextX = grid.enabled && grid.snapToGrid ? snapCanvasValue(rawX, grid) : rawX
  const nextY = grid.enabled && grid.snapToGrid ? snapCanvasValue(rawY, grid) : rawY

  return {
    ...object,
    x: clampCanvasValue(nextX, 0, canvasWidth - object.width),
    y: clampCanvasValue(nextY, 0, canvasHeight - object.height),
  }
}

function getObjectMoveStep(grid: SceneGrid): number {
  return grid.enabled && grid.snapToGrid ? grid.size : 40
}

function findCanvasObjectOrThrow(
  objects: SceneCanvasObject[],
  objectId: SceneCanvasObjectId,
): SceneCanvasObject {
  const object = objects.find((candidate) => candidate.id === objectId)

  if (!object) {
    throw new Error('scene-object-not-found')
  }

  return object
}

function normalizeTokenState(tokenState: SceneCanvasObjectTokenState): SceneCanvasObjectTokenState | undefined {
  const note = tokenState.note?.trim()
  const normalizedState: SceneCanvasObjectTokenState = {
    characterCardId: tokenState.characterCardId,
    hitPoints: normalizeOptionalInteger(tokenState.hitPoints),
    armorClass: normalizeOptionalInteger(tokenState.armorClass),
    note: note === '' ? undefined : note,
  }

  return Object.values(normalizedState).some((value) => value !== undefined) ? normalizedState : undefined
}

function normalizeOptionalInteger(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) {
    return undefined
  }

  return Math.max(0, Math.round(Number(value)))
}

function clampCanvasValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function createSceneCanvasObjectId(): SceneCanvasObjectId {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return `object-${randomId}`
  }

  return `object-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function updateActiveScene(
  campaign: Campaign,
  updatedAt: IsoDateString,
  updateScene: (scene: Scene) => Scene,
): Campaign {
  const hydratedCampaign = createCampaignWithHydratedScenes(campaign)
  const activeScene = getActiveCampaignScene(hydratedCampaign)

  if (activeScene === null) {
    throw new Error('scene-not-selected')
  }

  return {
    ...hydratedCampaign,
    updatedAt,
    scenes: hydratedCampaign.scenes.map((scene) => (scene.id === activeScene.id ? updateScene(scene) : scene)),
  }
}
