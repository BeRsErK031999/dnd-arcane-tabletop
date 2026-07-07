import { ipcMain, type BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants/index.js'
import type { PlayerScreenOpenResult } from '../../shared/types/index.js'

export function registerPlayerScreenIpc(getOrCreatePlayerWindow: () => BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.playerScreen.open, (): PlayerScreenOpenResult => {
    const playerWindow = getOrCreatePlayerWindow()

    return {
      opened: !playerWindow.isDestroyed(),
    }
  })
}
