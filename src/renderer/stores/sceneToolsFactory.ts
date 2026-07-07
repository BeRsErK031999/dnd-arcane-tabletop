import type { Campaign, IsoDateString, Scene, SceneCanvasViewport, SceneGrid } from '@shared/types'
import {
  createSceneCanvasWithMeasurement,
  createSceneCanvasWithoutMeasurements,
  createSceneCanvasWithViewport,
  getSceneCanvasState,
} from './sceneCanvasFactory'
import {
  createCampaignWithHydratedScenes,
  createHydratedSceneGrid,
  getActiveCampaignScene,
} from './sceneFactory'

export type SceneMeasurementTemplate = 'ruler' | 'circle' | 'cone' | 'square'

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
