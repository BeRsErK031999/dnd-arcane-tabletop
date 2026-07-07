import type { DesktopApi } from '../../preload/types'
import {
  createDefaultPlayerScreenState,
  type Campaign,
  type CampaignId,
  type CampaignSummary,
  type PlayerScreenCommandResult,
  type PlayerScreenStatus,
} from '@shared/types'

const browserFallbackReason = 'desktop-api-unavailable'
const browserFallbackState = createDefaultPlayerScreenState()
const browserFallbackCampaigns = new Map<CampaignId, Campaign>()
const browserFallbackStatus: PlayerScreenStatus = {
  isOpen: false,
  isFullscreen: false,
  state: browserFallbackState,
}

function createBrowserFallbackResult(): PlayerScreenCommandResult {
  return {
    ok: false,
    reason: browserFallbackReason,
    ...browserFallbackStatus,
  }
}

const browserFallbackApi: DesktopApi = {
  storage: {
    listCampaigns: async () =>
      Array.from(browserFallbackCampaigns.values())
        .map(createCampaignSummary)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    loadCampaign: async (campaignId: CampaignId) => browserFallbackCampaigns.get(campaignId) ?? null,
    saveCampaign: async (campaign: Campaign) => {
      browserFallbackCampaigns.set(campaign.id, campaign)
    },
    deleteCampaign: async (campaignId: CampaignId) => {
      browserFallbackCampaigns.delete(campaignId)
    },
  },
  playerScreen: {
    open: async () => ({
      opened: false,
      alreadyOpen: false,
      reason: browserFallbackReason,
      status: browserFallbackStatus,
    }),
    close: async () => createBrowserFallbackResult(),
    focus: async () => createBrowserFallbackResult(),
    getStatus: async () => browserFallbackStatus,
    setFullscreen: async () => createBrowserFallbackResult(),
    toggleFullscreen: async () => createBrowserFallbackResult(),
    getState: async () => browserFallbackState,
    updateState: async () => createBrowserFallbackResult(),
    resetState: async () => createBrowserFallbackResult(),
    hide: async () => createBrowserFallbackResult(),
    show: async () => createBrowserFallbackResult(),
    onStateUpdated: () => () => undefined,
    onStatusChanged: () => () => undefined,
  },
}

export const desktopApi = window.arcaneTabletop ?? browserFallbackApi

function createCampaignSummary(campaign: Campaign): CampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    updatedAt: campaign.updatedAt,
    sceneCount: campaign.scenes.length,
    assetCount: campaign.assets.length,
    characterCount: campaign.characterCards.length,
  }
}
