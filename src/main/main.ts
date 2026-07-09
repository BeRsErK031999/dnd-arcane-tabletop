import { app, BrowserWindow, dialog, Menu } from 'electron'
import { AssetImportService } from './assets/AssetImportService.js'
import { createMasterWindow } from './windows/masterWindow.js'
import { registerIpcHandlers } from './ipc/index.js'
import { PlayerScreenController } from './playerScreen/PlayerScreenController.js'
import { JsonStorageService } from './storage/JsonStorageService.js'
import { getCampaignsDirectory } from './storage/storagePaths.js'
import { seedReferenceCampaign } from './storage/referenceCampaignSeed.js'

const playerScreenController = new PlayerScreenController()

async function bootstrap(): Promise<void> {
  Menu.setApplicationMenu(null)

  const campaignsDirectory = getCampaignsDirectory()
  const storageService = new JsonStorageService(campaignsDirectory)
  const assetImportService = new AssetImportService(() => storageService.getCampaignsDirectory(), pickImageFile)
  await storageService.initialize()
  await seedReferenceCampaign(storageService, storageService.getCampaignsDirectory())

  createMasterWindow()

  registerIpcHandlers({
    assetImportService,
    storageService,
    playerScreenController,
  })
}

async function pickImageFile(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      {
        name: 'Images',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'jfif'],
      },
    ],
  })

  return result.canceled ? null : (result.filePaths[0] ?? null)
}

app.whenReady().then(() => {
  void bootstrap()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMasterWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
