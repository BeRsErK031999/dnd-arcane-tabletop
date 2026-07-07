import type { PlayerScreenController } from '../playerScreen/PlayerScreenController.js'
import type { StorageService } from '../storage/StorageService.js'
import { registerPlayerScreenIpc } from './playerScreenIpc.js'
import { registerStorageIpc } from './storageIpc.js'

export interface IpcContext {
  storageService: StorageService
  playerScreenController: PlayerScreenController
}

export function registerIpcHandlers(context: IpcContext): void {
  registerStorageIpc(context.storageService)
  registerPlayerScreenIpc(context.playerScreenController)
}
