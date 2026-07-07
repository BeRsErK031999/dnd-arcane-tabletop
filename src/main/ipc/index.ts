import type { BrowserWindow } from 'electron'
import type { StorageService } from '../storage/StorageService.js'
import { registerPlayerScreenIpc } from './playerScreenIpc.js'
import { registerStorageIpc } from './storageIpc.js'

export interface IpcContext {
  storageService: StorageService
  getOrCreatePlayerWindow: () => BrowserWindow
}

export function registerIpcHandlers(context: IpcContext): void {
  registerStorageIpc(context.storageService)
  registerPlayerScreenIpc(context.getOrCreatePlayerWindow)
}
