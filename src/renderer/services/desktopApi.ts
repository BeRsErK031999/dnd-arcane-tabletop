import type { DesktopApi } from '../../preload/types'
import {
  createDefaultPlayerScreenState,
  type Campaign,
  type CampaignId,
  type CampaignSummary,
  type PlayerScreenCommandResult,
  type PlayerScreenState,
  type PlayerScreenStatus,
} from '@shared/types'

const browserFallbackReason = 'desktop-api-unavailable'
let browserFallbackState = createDefaultPlayerScreenState()
const browserFallbackCampaigns = new Map<CampaignId, Campaign>()
const browserFallbackStatus: PlayerScreenStatus = {
  isOpen: false,
  isFullscreen: false,
  state: browserFallbackState,
}
const browserFallbackStateListeners = new Set<(state: PlayerScreenState) => void>()
const browserFallbackStatusListeners = new Set<(status: PlayerScreenStatus) => void>()

function createBrowserFallbackResult(ok = false, reason: string | undefined = browserFallbackReason): PlayerScreenCommandResult {
  return {
    ok,
    reason,
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
    updateState: async (state: PlayerScreenState) => updateBrowserFallbackState(state),
    resetState: async () => updateBrowserFallbackState(createDefaultPlayerScreenState()),
    hide: async () =>
      updateBrowserFallbackState({
        ...browserFallbackState,
        isHidden: true,
      }),
    show: async () =>
      updateBrowserFallbackState({
        ...browserFallbackState,
        isHidden: false,
      }),
    onStateUpdated: (listener) => {
      browserFallbackStateListeners.add(listener)
      return () => browserFallbackStateListeners.delete(listener)
    },
    onStatusChanged: (listener) => {
      browserFallbackStatusListeners.add(listener)
      return () => browserFallbackStatusListeners.delete(listener)
    },
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

function updateBrowserFallbackState(state: PlayerScreenState): PlayerScreenCommandResult {
  browserFallbackState = {
    ...state,
    visibleTokenIds: [...state.visibleTokenIds],
    revealedAssetIds: [...state.revealedAssetIds],
    updatedAt: new Date().toISOString(),
  }
  browserFallbackStatus.state = browserFallbackState

  for (const listener of browserFallbackStateListeners) {
    listener(browserFallbackState)
  }

  for (const listener of browserFallbackStatusListeners) {
    listener(browserFallbackStatus)
  }

  return createBrowserFallbackResult(true, undefined)
}
