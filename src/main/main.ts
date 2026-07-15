import { app, BrowserWindow, dialog, Menu } from 'electron'
import path from 'node:path'
import { AssetImportService } from './assets/AssetImportService.js'
import { AssetLibraryService } from './assets/AssetLibraryService.js'
import { SqlJsAssetCatalog } from './assets/catalog/SqlJsAssetCatalog.js'
import { AssetLibraryIndexer } from './assets/indexing/AssetLibraryIndexer.js'
import { SharpImageProcessor } from './assets/indexing/SharpImageProcessor.js'
import { createMasterWindow } from './windows/masterWindow.js'
import { registerIpcHandlers } from './ipc/index.js'
import { PlayerScreenController } from './playerScreen/PlayerScreenController.js'
import { ProjectTransferService } from './projects/ProjectTransferService.js'
import { JsonStorageService } from './storage/JsonStorageService.js'
import { getAssetLibraryDirectory, getCampaignsDirectory } from './storage/storagePaths.js'
import { seedReferenceCampaign } from './storage/referenceCampaignSeed.js'

const playerScreenController = new PlayerScreenController()

async function bootstrap(): Promise<void> {
  Menu.setApplicationMenu(null)

  const campaignsDirectory = getCampaignsDirectory()
  const storageService = new JsonStorageService(campaignsDirectory)
  const assetImportService = new AssetImportService(() => storageService.getCampaignsDirectory(), pickImageFile)
  const projectTransferService = new ProjectTransferService(storageService)
  const assetLibraryDirectory = getAssetLibraryDirectory()
  const assetCatalog = new SqlJsAssetCatalog(path.join(assetLibraryDirectory, 'asset-catalog.sqlite'))
  const assetLibraryIndexer = new AssetLibraryIndexer(
    assetCatalog,
    path.join(assetLibraryDirectory, 'previews'),
    new SharpImageProcessor(),
  )
  const assetLibraryService = new AssetLibraryService(assetCatalog, assetLibraryIndexer)
  await storageService.initialize()
  await assetLibraryService.initialize()
  await seedReferenceCampaign(storageService, storageService.getCampaignsDirectory())

  registerIpcHandlers({
    assetImportService,
    assetLibraryService,
    projectTransferService,
    storageService,
    playerScreenController,
  })

  createMasterWindow()
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
