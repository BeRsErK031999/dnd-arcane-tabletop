import type { DesktopApi } from '../../preload/types'

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
      reason: 'desktop-api-unavailable',
    }),
  },
}

export const desktopApi = window.arcaneTabletop ?? browserFallbackApi
