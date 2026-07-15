import {
  createDefaultPlayerScreenState,
  type Campaign,
  type CampaignId,
  type IsoDateString,
} from '@shared/types'
import { createHydratedSceneCanvasViewport } from './sceneCanvasFactory'

interface CreateEmptyCampaignOptions {
  id?: CampaignId
  name: string
  description?: string
  timestamp?: IsoDateString
}

export function createEmptyCampaign(options: CreateEmptyCampaignOptions): Campaign {
  const timestamp = options.timestamp ?? new Date().toISOString()
  const campaignId = options.id ?? createCampaignId()
  const description = options.description?.trim()

  return {
    id: campaignId,
    name: normalizeCampaignName(options.name),
    description: description === '' ? undefined : description,
    createdAt: timestamp,
    updatedAt: timestamp,
    scenes: [],
    assets: [],
    characterCards: [],
    notes: [],
    combatState: {
      campaignId,
      isActive: false,
      round: 0,
      turnIndex: 0,
      participants: [],
    },
    playerScreenState: {
      ...createDefaultPlayerScreenState(timestamp),
      campaignId,
    },
  }
}

export function createUpdatedCampaignMetadata(
  campaign: Campaign,
  name: string,
  description?: string,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const trimmedDescription = description?.trim()

  return {
    ...campaign,
    name: normalizeCampaignName(name),
    description: trimmedDescription === '' ? undefined : trimmedDescription,
    updatedAt,
  }
}

export function createCampaignWithHydratedPlayerScreenState(campaign: Campaign): Campaign {
  const legacyState = campaign.playerScreenState as Partial<Campaign['playerScreenState']>
  const playerViewport = createHydratedSceneCanvasViewport(
    legacyState.playerViewport ?? legacyState.sceneCanvas?.viewport,
  )

  return {
    ...campaign,
    playerScreenState: {
      ...createDefaultPlayerScreenState(campaign.updatedAt),
      ...legacyState,
      playerViewport,
      sceneCanvas: legacyState.sceneCanvas
        ? {
            ...legacyState.sceneCanvas,
            viewport: { ...playerViewport },
          }
        : undefined,
    },
  }
}

function createCampaignId(): CampaignId {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return `campaign-${randomId}`
  }

  return `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeCampaignName(name: string): string {
  const trimmedName = name.trim()
  return trimmedName === '' ? 'Новая кампания' : trimmedName
}
