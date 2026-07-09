import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants/index.js'
import type {
  Campaign,
  CampaignId,
  CampaignsDirectoryInfo,
  CampaignsDirectorySelectionResult,
} from '../../shared/types/index.js'
import type { StorageService } from '../storage/StorageService.js'

export function registerStorageIpc(storageService: StorageService): void {
  ipcMain.handle(IPC_CHANNELS.storage.getCampaignsDirectory, () => getCampaignsDirectoryInfo(storageService))

  ipcMain.handle(IPC_CHANNELS.storage.selectCampaignsDirectory, async (event) => {
    const selectedDirectory = await pickCampaignsDirectory(
      storageService.getCampaignsDirectory(),
      BrowserWindow.fromWebContents(event.sender),
    )

    if (selectedDirectory === null) {
      return createDirectorySelectionResult(storageService, true)
    }

    await storageService.setCampaignsDirectory(selectedDirectory)
    return createDirectorySelectionResult(storageService, false)
  })

  ipcMain.handle(IPC_CHANNELS.storage.saveCampaignToDirectory, async (event, campaign: Campaign) => {
    const selectedDirectory = await pickCampaignsDirectory(
      storageService.getCampaignsDirectory(),
      BrowserWindow.fromWebContents(event.sender),
    )

    if (selectedDirectory === null) {
      return createDirectorySelectionResult(storageService, true)
    }

    const previousDirectory = storageService.getCampaignsDirectory()

    try {
      await storageService.setCampaignsDirectory(selectedDirectory)
      await storageService.saveCampaign(campaign)
      return createDirectorySelectionResult(storageService, false)
    } catch (error) {
      await storageService.setCampaignsDirectory(previousDirectory)
      throw error
    }
  })

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

function getCampaignsDirectoryInfo(storageService: StorageService): CampaignsDirectoryInfo {
  return {
    path: storageService.getCampaignsDirectory(),
  }
}

async function createDirectorySelectionResult(
  storageService: StorageService,
  canceled: boolean,
): Promise<CampaignsDirectorySelectionResult> {
  return {
    canceled,
    directory: getCampaignsDirectoryInfo(storageService),
    campaigns: await storageService.listCampaigns(),
  }
}

async function pickCampaignsDirectory(
  defaultPath: string,
  browserWindow: BrowserWindow | null,
): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Выберите папку проекта',
    buttonLabel: 'Выбрать папку',
    defaultPath,
    properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
  }
  const result =
    browserWindow === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(browserWindow, options)

  return result.canceled ? null : (result.filePaths[0] ?? null)
}
