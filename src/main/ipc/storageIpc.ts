import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants/index.js'
import type {
  Campaign,
  CampaignId,
  CampaignsDirectoryInfo,
  CampaignsDirectorySelectionResult,
  ProjectExportResult,
  ProjectImportResult,
} from '../../shared/types/index.js'
import type { ProjectTransferService } from '../projects/ProjectTransferService.js'
import type { StorageService } from '../storage/StorageService.js'

export function registerStorageIpc(
  storageService: StorageService,
  projectTransferService: ProjectTransferService,
): void {
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

  ipcMain.handle(IPC_CHANNELS.storage.importProject, async (event): Promise<ProjectImportResult> => {
    const sourceFilePath = await pickProjectPackage(BrowserWindow.fromWebContents(event.sender))

    return sourceFilePath === null
      ? { ok: false, reason: 'cancelled' }
      : projectTransferService.importCampaign(sourceFilePath)
  })

  ipcMain.handle(
    IPC_CHANNELS.storage.exportProject,
    async (event, campaignId: CampaignId): Promise<ProjectExportResult> => {
      const campaign = await storageService.loadCampaign(campaignId)

      if (campaign === null) {
        return { ok: false, reason: 'campaign-not-found' }
      }

      const targetFilePath = await pickProjectExportPath(
        createProjectPackageFileName(campaign.name),
        BrowserWindow.fromWebContents(event.sender),
      )

      return targetFilePath === null
        ? { ok: false, reason: 'cancelled' }
        : projectTransferService.exportCampaign(campaignId, targetFilePath)
    },
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

async function pickProjectPackage(browserWindow: BrowserWindow | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Импорт проекта',
    buttonLabel: 'Импортировать',
    properties: ['openFile'],
    filters: [
      {
        name: 'D&D Arcane Tabletop Project',
        extensions: ['arcane-campaign'],
      },
    ],
  }
  const result =
    browserWindow === null
      ? await dialog.showOpenDialog(options)
      : await dialog.showOpenDialog(browserWindow, options)

  return result.canceled ? null : (result.filePaths[0] ?? null)
}

async function pickProjectExportPath(
  defaultFileName: string,
  browserWindow: BrowserWindow | null,
): Promise<string | null> {
  const options: Electron.SaveDialogOptions = {
    title: 'Экспорт проекта',
    buttonLabel: 'Экспортировать',
    defaultPath: defaultFileName,
    filters: [
      {
        name: 'D&D Arcane Tabletop Project',
        extensions: ['arcane-campaign'],
      },
    ],
  }
  const result =
    browserWindow === null
      ? await dialog.showSaveDialog(options)
      : await dialog.showSaveDialog(browserWindow, options)

  return result.canceled ? null : (result.filePath ?? null)
}

function createProjectPackageFileName(campaignName: string): string {
  const safeName = [...campaignName.trim()]
    .map((character) =>
      character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character,
    )
    .join('')
    .replace(/[. ]+$/g, '')
    .slice(0, 100)

  return `${safeName || 'dnd-campaign'}.arcane-campaign`
}
