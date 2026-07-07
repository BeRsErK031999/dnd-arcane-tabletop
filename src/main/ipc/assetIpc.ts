import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/constants/index.js'
import type { ImportImageAssetRequest } from '../../shared/types/index.js'
import type { AssetImportService } from '../assets/AssetImportService.js'

export function registerAssetIpc(assetImportService: AssetImportService): void {
  ipcMain.handle(IPC_CHANNELS.assets.importImage, (_event, request: ImportImageAssetRequest) =>
    assetImportService.importImageAsset(request),
  )
}
