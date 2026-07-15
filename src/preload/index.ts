import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '../shared/constants/index.js'
import type {
  Campaign,
  CampaignId,
  ImportImageAssetRequest,
  PlayerScreenState,
  PlayerScreenStatus,
} from '../shared/types/index.js'
import type { DesktopApi } from './types.js'

const desktopApi: DesktopApi = {
  storage: {
    getCampaignsDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.storage.getCampaignsDirectory),
    selectCampaignsDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.storage.selectCampaignsDirectory),
    saveCampaignToDirectory: (campaign: Campaign) =>
      ipcRenderer.invoke(IPC_CHANNELS.storage.saveCampaignToDirectory, campaign),
    listCampaigns: () => ipcRenderer.invoke(IPC_CHANNELS.storage.listCampaigns),
    loadCampaign: (campaignId: CampaignId) => ipcRenderer.invoke(IPC_CHANNELS.storage.loadCampaign, campaignId),
    saveCampaign: (campaign: Campaign) => ipcRenderer.invoke(IPC_CHANNELS.storage.saveCampaign, campaign),
    deleteCampaign: (campaignId: CampaignId) => ipcRenderer.invoke(IPC_CHANNELS.storage.deleteCampaign, campaignId),
    importProject: () => ipcRenderer.invoke(IPC_CHANNELS.storage.importProject),
    exportProject: (campaignId: CampaignId) => ipcRenderer.invoke(IPC_CHANNELS.storage.exportProject, campaignId),
  },
  assets: {
    importImageAsset: (request: ImportImageAssetRequest) => ipcRenderer.invoke(IPC_CHANNELS.assets.importImage, request),
  },
  playerScreen: {
    open: () => ipcRenderer.invoke(IPC_CHANNELS.playerScreen.open),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.playerScreen.close),
    focus: () => ipcRenderer.invoke(IPC_CHANNELS.playerScreen.focus),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.playerScreen.statusGet),
    setFullscreen: (isFullscreen: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.playerScreen.fullscreen.set, isFullscreen),
    toggleFullscreen: () => ipcRenderer.invoke(IPC_CHANNELS.playerScreen.fullscreen.toggle),
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.playerScreen.state.get),
    updateState: (state: PlayerScreenState) => ipcRenderer.invoke(IPC_CHANNELS.playerScreen.state.update, state),
    resetState: () => ipcRenderer.invoke(IPC_CHANNELS.playerScreen.state.reset),
    hide: () => ipcRenderer.invoke(IPC_CHANNELS.playerScreen.visibility.hide),
    show: () => ipcRenderer.invoke(IPC_CHANNELS.playerScreen.visibility.show),
    onStateUpdated: (listener: (state: PlayerScreenState) => void) =>
      subscribeToIpc(IPC_CHANNELS.playerScreen.state.changed, listener),
    onStatusChanged: (listener: (status: PlayerScreenStatus) => void) =>
      subscribeToIpc(IPC_CHANNELS.playerScreen.statusChanged, listener),
  },
}

contextBridge.exposeInMainWorld('arcaneTabletop', desktopApi)

function subscribeToIpc<Payload>(channel: string, listener: (payload: Payload) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: Payload): void => {
    listener(payload)
  }

  ipcRenderer.on(channel, handler)

  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}
