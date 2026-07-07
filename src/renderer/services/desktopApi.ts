import type { DesktopApi } from '../../preload/types'
import { createDefaultPlayerScreenState, type PlayerScreenCommandResult, type PlayerScreenStatus } from '@shared/types'

const browserFallbackReason = 'desktop-api-unavailable'
const browserFallbackState = createDefaultPlayerScreenState()
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
    listCampaigns: async () => [],
    loadCampaign: async () => null,
    saveCampaign: async () => undefined,
    deleteCampaign: async () => undefined,
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
