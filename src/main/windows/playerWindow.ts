import { BrowserWindow } from 'electron'
import { APP_NAME, PLAYER_SCREEN_QUERY_VALUE } from '../../shared/constants/index.js'
import { getPreloadPath, loadRendererWindow } from './loadRendererWindow.js'

export function createPlayerWindow(): BrowserWindow {
  const window = new BrowserWindow({
    title: `${APP_NAME} - Player Screen`,
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: '#0f1014',
    autoHideMenuBar: true,
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

  void loadRendererWindow(window, PLAYER_SCREEN_QUERY_VALUE)

  return window
}
