import type {
  Campaign,
  CampaignId,
  IsoDateString,
  PlayerScreenState,
  Scene,
  SceneGrid,
  SceneId,
} from '@shared/types'

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
}

export function createEmptyScene(options: CreateEmptySceneOptions): Scene {
  const description = options.description?.trim()

  return {
    id: options.id ?? createSceneId(),
    campaignId: options.campaignId,
    name: normalizeSceneName(options.name),
    description: description === '' ? undefined : description,
    tokens: [],
    grid: { ...defaultSceneGrid },
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
    scenes: shouldActivateScene ? [scene] : [...campaign.scenes, scene],
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
  const activeScene = findSceneOrThrow(campaign, sceneId)

  const nextCampaign = {
    ...campaign,
    scenes: campaign.scenes.map((scene) => ({
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
  return campaign.scenes.find((scene) => scene.isActive) ?? campaign.scenes[0] ?? null
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
  return {
    ...createSceneSelectionState(campaign, scene, updatedAt),
    mode: 'scene',
    isHidden: false,
    title: scene.name,
    message: scene.description ?? 'Сцена готова к показу игрокам.',
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

  return scene
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
