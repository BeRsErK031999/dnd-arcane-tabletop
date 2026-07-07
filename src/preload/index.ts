import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/constants/index.js'
import type { Campaign, CampaignId } from '../shared/types/index.js'
import type { DesktopApi } from './types.js'

const desktopApi: DesktopApi = {
  storage: {
    listCampaigns: () => ipcRenderer.invoke(IPC_CHANNELS.storage.listCampaigns),
    loadCampaign: (campaignId: CampaignId) => ipcRenderer.invoke(IPC_CHANNELS.storage.loadCampaign, campaignId),
    saveCampaign: (campaign: Campaign) => ipcRenderer.invoke(IPC_CHANNELS.storage.saveCampaign, campaign),
    deleteCampaign: (campaignId: CampaignId) => ipcRenderer.invoke(IPC_CHANNELS.storage.deleteCampaign, campaignId),
  },
  playerScreen: {
    open: () => ipcRenderer.invoke(IPC_CHANNELS.playerScreen.open),
  },
}

contextBridge.exposeInMainWorld('arcaneTabletop', desktopApi)
