import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants/index.js'
import type { Campaign, CampaignId } from '../../shared/types/index.js'
import type { StorageService } from '../storage/StorageService.js'

export function registerStorageIpc(storageService: StorageService): void {
  ipcMain.handle(IPC_CHANNELS.storage.listCampaigns, () => storageService.listCampaigns())

  ipcMain.handle(IPC_CHANNELS.storage.loadCampaign, (_event, campaignId: CampaignId) =>
    storageService.loadCampaign(campaignId),
  )

  ipcMain.handle(IPC_CHANNELS.storage.saveCampaign, (_event, campaign: Campaign) =>
    storageService.saveCampaign(campaign),
  )

  ipcMain.handle(IPC_CHANNELS.storage.deleteCampaign, (_event, campaignId: CampaignId) =>
    storageService.deleteCampaign(campaignId),
  )
}
