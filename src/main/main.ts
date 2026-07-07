import { app, BrowserWindow } from 'electron'
import { createMasterWindow } from './windows/masterWindow.js'
import { registerIpcHandlers } from './ipc/index.js'
import { PlayerScreenController } from './playerScreen/PlayerScreenController.js'
import { JsonStorageService } from './storage/JsonStorageService.js'
import { getCampaignsDirectory } from './storage/storagePaths.js'

const playerScreenController = new PlayerScreenController()

async function bootstrap(): Promise<void> {
  const storageService = new JsonStorageService(getCampaignsDirectory())
  await storageService.initialize()

  createMasterWindow()

  registerIpcHandlers({
    storageService,
    playerScreenController,
  })
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
