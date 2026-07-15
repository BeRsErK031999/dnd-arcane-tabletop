import type { AssetImportService } from '../assets/AssetImportService.js'
import type { AssetLibraryService } from '../assets/AssetLibraryService.js'
import type { PlayerScreenController } from '../playerScreen/PlayerScreenController.js'
import type { ProjectTransferService } from '../projects/ProjectTransferService.js'
import type { StorageService } from '../storage/StorageService.js'
import { registerAssetIpc } from './assetIpc.js'
import { registerAssetLibraryIpc } from './assetLibraryIpc.js'
import { registerPlayerScreenIpc } from './playerScreenIpc.js'
import { registerStorageIpc } from './storageIpc.js'

export interface IpcContext {
  assetImportService: AssetImportService
  assetLibraryService: AssetLibraryService
  projectTransferService: ProjectTransferService
  storageService: StorageService
  playerScreenController: PlayerScreenController
}

export function registerIpcHandlers(context: IpcContext): void {
  registerAssetIpc(context.assetImportService)
  registerAssetLibraryIpc(context.assetLibraryService)
  registerStorageIpc(context.storageService, context.projectTransferService)
  registerPlayerScreenIpc(context.playerScreenController)
}
