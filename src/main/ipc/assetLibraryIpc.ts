import { BrowserWindow, dialog, ipcMain } from 'electron'
import type {
  AssetLibraryQuery,
  AssetLibrarySourceId,
  ConnectAssetLibraryResult,
  IndexedAssetId,
  ManageIndexedAssetForCampaignRequest,
} from '../../shared/types/index.js'
import { IPC_CHANNELS } from '../../shared/constants/index.js'
import type { AssetLibraryService } from '../assets/AssetLibraryService.js'

export function registerAssetLibraryIpc(assetLibraryService: AssetLibraryService): void {
  ipcMain.handle(IPC_CHANNELS.assetLibrary.getSnapshot, () => assetLibraryService.getSnapshot())
  ipcMain.handle(IPC_CHANNELS.assetLibrary.connectDirectory, async (): Promise<ConnectAssetLibraryResult> => {
    const result = await dialog.showOpenDialog({
      title: 'Подключить папку ассетов',
      buttonLabel: 'Подключить папку',
      properties: ['openDirectory'],
    })
    const directoryPath = result.filePaths[0]
    if (result.canceled || !directoryPath) {
      return { ok: false, reason: 'cancelled' }
    }
    return assetLibraryService.connectDirectory(directoryPath)
  })
  ipcMain.handle(IPC_CHANNELS.assetLibrary.startIndexing, (_event, sourceId: AssetLibrarySourceId) =>
    assetLibraryService.startIndexing(sourceId),
  )
  ipcMain.handle(IPC_CHANNELS.assetLibrary.cancelIndexing, () => assetLibraryService.cancelIndexing())
  ipcMain.handle(IPC_CHANNELS.assetLibrary.queryAssets, (_event, query: AssetLibraryQuery) =>
    assetLibraryService.queryAssets(query),
  )
  ipcMain.handle(IPC_CHANNELS.assetLibrary.updateTags, (_event, assetId: IndexedAssetId, tags: string[]) =>
    assetLibraryService.updateTags(assetId, tags),
  )
  ipcMain.handle(
    IPC_CHANNELS.assetLibrary.manageForCampaign,
    (_event, request: ManageIndexedAssetForCampaignRequest) =>
      assetLibraryService.manageIndexedAssetForCampaign(request),
  )
  ipcMain.handle(IPC_CHANNELS.assetLibrary.previewGarbageCollection, () =>
    assetLibraryService.previewManagedGarbageCollection(),
  )
  ipcMain.handle(IPC_CHANNELS.assetLibrary.collectGarbage, (_event, token: string) =>
    assetLibraryService.collectManagedGarbage(token),
  )

  assetLibraryService.subscribe((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.assetLibrary.snapshotChanged, snapshot)
    }
  })
}
