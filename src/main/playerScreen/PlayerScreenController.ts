import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants/index.js'
import {
  createDefaultPlayerScreenState,
  type PlayerScreenCommandResult,
  type PlayerScreenOpenResult,
  type PlayerScreenState,
  type PlayerScreenStatus,
} from '../../shared/types/index.js'
import { createPlayerWindow } from '../windows/playerWindow.js'

export class PlayerScreenController {
  private playerWindow: BrowserWindow | null = null
  private playerScreenState: PlayerScreenState = createDefaultPlayerScreenState()

  open(): PlayerScreenOpenResult {
    const alreadyOpen = this.getLivePlayerWindow() !== null
    const playerWindow = this.getOrCreatePlayerWindow()

    this.focusWindow(playerWindow)
    this.broadcastStatus()

    return {
      opened: true,
      alreadyOpen,
      reason: alreadyOpen ? 'focused-existing-window' : 'created-player-window',
      status: this.getStatus(),
    }
  }

  close(): PlayerScreenCommandResult {
    const playerWindow = this.getLivePlayerWindow()

    if (!playerWindow) {
      return this.createResult(false, 'player-window-not-open')
    }

    this.playerWindow = null
    playerWindow.close()
    this.broadcastStatus()

    return this.createResult(true)
  }

  focus(): PlayerScreenCommandResult {
    const playerWindow = this.getLivePlayerWindow()

    if (!playerWindow) {
      return this.createResult(false, 'player-window-not-open')
    }

    this.focusWindow(playerWindow)
    this.broadcastStatus()

    return this.createResult(true)
  }

  setFullscreen(isFullscreen: boolean): PlayerScreenCommandResult {
    const playerWindow = this.getLivePlayerWindow()

    if (!playerWindow) {
      return this.createResult(false, 'player-window-not-open')
    }

    playerWindow.setFullScreen(isFullscreen)
    this.broadcastStatus()

    return this.createResult(true)
  }

  toggleFullscreen(): PlayerScreenCommandResult {
    const playerWindow = this.getLivePlayerWindow()

    if (!playerWindow) {
      return this.createResult(false, 'player-window-not-open')
    }

    playerWindow.setFullScreen(!playerWindow.isFullScreen())
    this.broadcastStatus()

    return this.createResult(true)
  }

  getStatus(): PlayerScreenStatus {
    const playerWindow = this.getLivePlayerWindow()

    return {
      isOpen: playerWindow !== null,
      isFullscreen: playerWindow?.isFullScreen() ?? false,
      state: this.playerScreenState,
    }
  }

  getState(): PlayerScreenState {
    return this.playerScreenState
  }

  updateState(nextState: PlayerScreenState): PlayerScreenCommandResult {
    const playerViewport = nextState.playerViewport ?? nextState.sceneCanvas?.viewport ?? {
      zoom: 1,
      panX: 0,
      panY: 0,
    }

    this.playerScreenState = {
      ...nextState,
      playerViewport: { ...playerViewport },
      sceneCanvas: nextState.sceneCanvas
        ? {
            ...nextState.sceneCanvas,
            viewport: { ...playerViewport },
          }
        : undefined,
      visibleTokenIds: [...nextState.visibleTokenIds],
      revealedAssetIds: [...nextState.revealedAssetIds],
      updatedAt: this.createTimestamp(),
    }

    this.publishState()

    return this.createResult(true)
  }

  resetState(): PlayerScreenCommandResult {
    this.playerScreenState = createDefaultPlayerScreenState()
    this.publishState()

    return this.createResult(true)
  }

  hide(): PlayerScreenCommandResult {
    this.playerScreenState = {
      ...this.playerScreenState,
      isHidden: true,
      updatedAt: this.createTimestamp(),
    }

    this.publishState()

    return this.createResult(true)
  }

  show(): PlayerScreenCommandResult {
    this.playerScreenState = {
      ...this.playerScreenState,
      isHidden: false,
      updatedAt: this.createTimestamp(),
    }

    this.publishState()

    return this.createResult(true)
  }

  private getOrCreatePlayerWindow(): BrowserWindow {
    const existingWindow = this.getLivePlayerWindow()

    if (existingWindow) {
      return existingWindow
    }

    const playerWindow = createPlayerWindow()
    this.playerWindow = playerWindow

    playerWindow.webContents.on('did-finish-load', () => {
      this.sendStateToPlayerWindow()
    })

    playerWindow.on('enter-full-screen', () => {
      this.broadcastStatus()
    })

    playerWindow.on('leave-full-screen', () => {
      this.broadcastStatus()
    })

    playerWindow.once('closed', () => {
      if (this.playerWindow === playerWindow) {
        this.playerWindow = null
      }

      this.broadcastStatus()
    })

    return playerWindow
  }

  private getLivePlayerWindow(): BrowserWindow | null {
    if (this.playerWindow === null || this.playerWindow.isDestroyed()) {
      this.playerWindow = null
      return null
    }

    return this.playerWindow
  }

  private focusWindow(playerWindow: BrowserWindow): void {
    if (playerWindow.isMinimized()) {
      playerWindow.restore()
    }

    if (!playerWindow.isVisible()) {
      playerWindow.show()
    }

    playerWindow.focus()
  }

  private publishState(): void {
    this.sendStateToPlayerWindow()
    this.broadcastStatus()
  }

  private sendStateToPlayerWindow(): void {
    const playerWindow = this.getLivePlayerWindow()

    if (!playerWindow || playerWindow.webContents.isDestroyed()) {
      return
    }

    playerWindow.webContents.send(IPC_CHANNELS.playerScreen.state.changed, this.playerScreenState)
  }

  private broadcastStatus(): void {
    const status = this.getStatus()

    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.webContents.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.playerScreen.statusChanged, status)
      }
    }
  }

  private createResult(ok: boolean, reason?: string): PlayerScreenCommandResult {
    return {
      ok,
      reason,
      ...this.getStatus(),
    }
  }

  private createTimestamp(): string {
    return new Date().toISOString()
  }
}
