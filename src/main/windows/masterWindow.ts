import { BrowserWindow } from 'electron'
import { APP_NAME, MASTER_SCREEN_QUERY_VALUE } from '../../shared/constants/index.js'
import { getPreloadPath, loadRendererWindow } from './loadRendererWindow.js'

export function createMasterWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: APP_NAME,
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#151515',
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  void loadRendererWindow(window, MASTER_SCREEN_QUERY_VALUE)

  return window
}
