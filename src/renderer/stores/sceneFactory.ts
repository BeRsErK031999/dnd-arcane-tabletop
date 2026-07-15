import type {
  Campaign,
  CampaignId,
  IsoDateString,
  PlayerScreenState,
  Scene,
  SceneGrid,
  SceneId,
} from '@shared/types'
import {
  createHydratedSceneCanvasViewport,
  createDefaultSceneCanvas,
  createPlayerSceneCanvasProjection,
  createSceneWithHydratedCanvas,
} from './sceneCanvasFactory'

interface CreateEmptySceneOptions {
  campaignId: CampaignId
  id?: SceneId
  name: string
  description?: string
  isActive?: boolean
}

interface CreateCampaignSceneOptions {
  id?: SceneId
  name: string
  description?: string
}

const defaultSceneGrid: SceneGrid = {
  enabled: true,
  size: 70,
  color: '#8b7a5a',
  opacity: 0.35,
  distancePerCell: 5,
  unitLabel: 'ft',
  snapToGrid: true,
}

const metricGridUnitAliases = new Set(['m', 'meter', 'meters', 'metre', 'metres', 'м', 'метр', 'метры'])
const imperialGridUnitAliases = new Set(['ft', 'feet', 'foot', 'фут', 'футы'])

export function createEmptyScene(options: CreateEmptySceneOptions): Scene {
  const description = options.description?.trim()

  return {
    id: options.id ?? createSceneId(),
    campaignId: options.campaignId,
    name: normalizeSceneName(options.name),
    description: description === '' ? undefined : description,
    canvas: createDefaultSceneCanvas(),
    tokens: [],
    grid: createHydratedSceneGrid(),
    isActive: options.isActive ?? false,
  }
}

export function createCampaignWithNewScene(
  campaign: Campaign,
  options: CreateCampaignSceneOptions,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const shouldActivateScene = campaign.scenes.length === 0
  const scene = createEmptyScene({
    ...options,
    campaignId: campaign.id,
    isActive: shouldActivateScene,
  })
  const nextCampaign = {
    ...campaign,
    scenes: shouldActivateScene ? [scene] : [...campaign.scenes.map(createSceneWithHydratedState), scene],
    updatedAt,
  }

  if (!shouldActivateScene) {
    return nextCampaign
  }

  return {
    ...nextCampaign,
    playerScreenState: createSceneSelectionState(nextCampaign, scene, updatedAt),
  }
}

export function createCampaignWithActiveScene(
  campaign: Campaign,
  sceneId: SceneId,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const hydratedCampaign = createCampaignWithHydratedScenes(campaign)
  const activeScene = findSceneOrThrow(hydratedCampaign, sceneId)

  const nextCampaign = {
    ...hydratedCampaign,
    scenes: hydratedCampaign.scenes.map((scene) => ({
      ...scene,
      isActive: scene.id === sceneId,
    })),
    updatedAt,
  }

  return {
    ...nextCampaign,
    playerScreenState: createSceneSelectionState(nextCampaign, activeScene, updatedAt),
  }
}

export function createCampaignWithScenePreview(
  campaign: Campaign,
  sceneId: SceneId,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const campaignWithActiveScene = createCampaignWithActiveScene(campaign, sceneId, updatedAt)
  const activeScene = findSceneOrThrow(campaignWithActiveScene, sceneId)

  return {
    ...campaignWithActiveScene,
    playerScreenState: createScenePlayerScreenState(campaignWithActiveScene, activeScene, updatedAt),
  }
}

export function getActiveCampaignScene(campaign: Campaign): Scene | null {
  const scene = campaign.scenes.find((scene) => scene.isActive) ?? campaign.scenes[0] ?? null
  return scene ? createSceneWithHydratedState(scene) : null
}

export function createCampaignWithHydratedScenes(campaign: Campaign): Campaign {
  return {
    ...campaign,
    scenes: campaign.scenes.map(createSceneWithHydratedState),
  }
}

export function createSceneWithHydratedState(scene: Scene): Scene {
  return {
    ...createSceneWithHydratedCanvas(scene),
    grid: createHydratedSceneGrid(scene.grid),
  }
}

function createSceneSelectionState(campaign: Campaign, scene: Scene, updatedAt: IsoDateString): PlayerScreenState {
  return {
    ...campaign.playerScreenState,
    campaignId: campaign.id,
    activeSceneId: scene.id,
    scenePreview: createPlayerScenePreview(scene),
    updatedAt,
  }
}

function createScenePlayerScreenState(campaign: Campaign, scene: Scene, updatedAt: IsoDateString): PlayerScreenState {
  const playerViewport = createHydratedSceneCanvasViewport(campaign.playerScreenState.playerViewport)

  return {
    ...createSceneSelectionState(campaign, scene, updatedAt),
    mode: 'scene',
    isHidden: false,
    title: scene.name,
    message: scene.description ?? 'Сцена готова к показу игрокам.',
    playerViewport,
    sceneCanvas: createPlayerSceneCanvasProjection(scene, campaign.assets, playerViewport),
    visibleTokenIds: scene.tokens.map((token) => token.id),
    revealedAssetIds: scene.backgroundAssetId ? [scene.backgroundAssetId] : [],
  }
}

function createPlayerScenePreview(scene: Scene): PlayerScreenState['scenePreview'] {
  return {
    id: scene.id,
    name: scene.name,
    description: scene.description,
    locationLabel: 'Сцена кампании',
  }
}

function findSceneOrThrow(campaign: Campaign, sceneId: SceneId): Scene {
  const scene = campaign.scenes.find((candidate) => candidate.id === sceneId)

  if (!scene) {
    throw new Error('scene-not-found')
  }

  return createSceneWithHydratedState(scene)
}

function createSceneId(): SceneId {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return `scene-${randomId}`
  }

  return `scene-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeSceneName(name: string): string {
  const trimmedName = name.trim()
  return trimmedName === '' ? 'Новая сцена' : trimmedName
}

export function createHydratedSceneGrid(grid?: Partial<SceneGrid>): SceneGrid {
  return {
    enabled: grid?.enabled ?? defaultSceneGrid.enabled,
    size: clampNumber(grid?.size, 24, 180, defaultSceneGrid.size),
    color: grid?.color ?? defaultSceneGrid.color,
    opacity: clampNumber(grid?.opacity, 0.08, 0.9, defaultSceneGrid.opacity),
    distancePerCell: clampNumber(grid?.distancePerCell, 1, 30, defaultSceneGrid.distancePerCell),
    unitLabel: normalizeGridUnitLabel(grid?.unitLabel),
    snapToGrid: grid?.snapToGrid ?? defaultSceneGrid.snapToGrid,
  }
}

function normalizeGridUnitLabel(unitLabel: string | undefined): string {
  const normalizedUnit = unitLabel?.trim().toLowerCase()

  if (!normalizedUnit) {
    return defaultSceneGrid.unitLabel
  }

  if (metricGridUnitAliases.has(normalizedUnit)) {
    return 'm'
  }

  if (imperialGridUnitAliases.has(normalizedUnit)) {
    return 'ft'
  }

  return defaultSceneGrid.unitLabel
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }

  return Math.min(Math.max(Number(value), min), max)
}
