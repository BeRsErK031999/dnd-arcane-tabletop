import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants/index.js'
import type { PlayerScreenState } from '../../shared/types/index.js'
import type { PlayerScreenController } from '../playerScreen/PlayerScreenController.js'

export function registerPlayerScreenIpc(playerScreenController: PlayerScreenController): void {
  ipcMain.handle(IPC_CHANNELS.playerScreen.open, () => playerScreenController.open())
  ipcMain.handle(IPC_CHANNELS.playerScreen.close, () => playerScreenController.close())
  ipcMain.handle(IPC_CHANNELS.playerScreen.focus, () => playerScreenController.focus())
  ipcMain.handle(IPC_CHANNELS.playerScreen.statusGet, () => playerScreenController.getStatus())
  ipcMain.handle(IPC_CHANNELS.playerScreen.fullscreen.set, (_event, isFullscreen: boolean) =>
    playerScreenController.setFullscreen(isFullscreen),
  )
  ipcMain.handle(IPC_CHANNELS.playerScreen.fullscreen.toggle, () => playerScreenController.toggleFullscreen())
  ipcMain.handle(IPC_CHANNELS.playerScreen.state.get, () => playerScreenController.getState())
  ipcMain.handle(IPC_CHANNELS.playerScreen.state.update, (_event, state: PlayerScreenState) =>
    playerScreenController.updateState(state),
  )
  ipcMain.handle(IPC_CHANNELS.playerScreen.state.reset, () => playerScreenController.resetState())
  ipcMain.handle(IPC_CHANNELS.playerScreen.visibility.hide, () => playerScreenController.hide())
  ipcMain.handle(IPC_CHANNELS.playerScreen.visibility.show, () => playerScreenController.show())
}
