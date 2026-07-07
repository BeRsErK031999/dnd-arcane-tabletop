import { app, type BrowserWindow } from 'electron'
import path from 'node:path'
import { MASTER_SCREEN_QUERY_VALUE, PLAYER_SCREEN_QUERY_VALUE } from '../../shared/constants/index.js'

export type RendererScreen = typeof MASTER_SCREEN_QUERY_VALUE | typeof PLAYER_SCREEN_QUERY_VALUE

export async function loadRendererWindow(window: BrowserWindow, screen: RendererScreen): Promise<void> {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    await window.loadURL(`${devServerUrl}?screen=${screen}`)
    return
  }

  await window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'), {
    query: { screen },
  })
}

export function getPreloadPath(): string {
  return path.join(app.getAppPath(), 'dist-electron', 'preload', 'index.js')
}
