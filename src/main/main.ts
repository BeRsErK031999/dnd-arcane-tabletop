import { app, BrowserWindow } from 'electron'
import { createMasterWindow } from './windows/masterWindow.js'
import { createPlayerWindow } from './windows/playerWindow.js'
import { registerIpcHandlers } from './ipc/index.js'
import { JsonStorageService } from './storage/JsonStorageService.js'
import { getCampaignsDirectory } from './storage/storagePaths.js'

let playerWindow: BrowserWindow | null = null

async function bootstrap(): Promise<void> {
  const storageService = new JsonStorageService(getCampaignsDirectory())
  await storageService.initialize()

  createMasterWindow()

  registerIpcHandlers({
    storageService,
    getOrCreatePlayerWindow: () => {
      if (playerWindow === null || playerWindow.isDestroyed()) {
        playerWindow = createPlayerWindow()
        playerWindow.on('closed', () => {
          playerWindow = null
        })
      }

      playerWindow.focus()
      return playerWindow
    },
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
