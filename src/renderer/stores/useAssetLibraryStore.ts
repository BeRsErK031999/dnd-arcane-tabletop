import { useCallback, useEffect, useState } from 'react'
import type {
  AssetLibrarySnapshot,
  AssetLibrarySourceId,
  ConnectAssetLibraryResult,
  StartAssetIndexResult,
} from '@shared/types'
import { desktopApi } from '@renderer/services/desktopApi'

type AssetLibraryStoreStatus = 'loading' | 'idle' | 'working'

const emptySnapshot: AssetLibrarySnapshot = {
  sources: [],
  progress: {
    status: 'idle',
    phase: 'idle',
    discoveredCount: 0,
    processedCount: 0,
    indexedCount: 0,
    skippedCount: 0,
    errorCount: 0,
  },
}

export interface AssetLibraryStore {
  snapshot: AssetLibrarySnapshot
  status: AssetLibraryStoreStatus
  lastError: string | null
  refresh(): Promise<void>
  connectDirectory(): Promise<boolean>
  startIndexing(sourceId: AssetLibrarySourceId): Promise<boolean>
  cancelIndexing(): Promise<void>
}

export function useAssetLibraryStore(): AssetLibraryStore {
  const [snapshot, setSnapshot] = useState<AssetLibrarySnapshot>(emptySnapshot)
  const [status, setStatus] = useState<AssetLibraryStoreStatus>('loading')
  const [lastError, setLastError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setStatus('loading')
    try {
      setSnapshot(await desktopApi.assetLibrary.getSnapshot())
      setLastError(null)
    } catch {
      setLastError('Не удалось прочитать каталог общей библиотеки.')
    } finally {
      setStatus('idle')
    }
  }, [])

  useEffect(() => {
    void refresh()
    return desktopApi.assetLibrary.onSnapshotChanged((nextSnapshot) => {
      setSnapshot(nextSnapshot)
      setStatus('idle')
      if (nextSnapshot.progress.status !== 'failed') {
        setLastError(null)
      }
    })
  }, [refresh])

  const connectDirectory = useCallback(async (): Promise<boolean> => {
    setStatus('working')
    setLastError(null)
    try {
      const result = await desktopApi.assetLibrary.connectDirectory()
      if (!result.ok) {
        if (result.reason !== 'cancelled') {
          setLastError(messageForConnectFailure(result))
        }
        return false
      }
      setSnapshot(result.snapshot)
      return true
    } catch {
      setLastError('Не удалось подключить папку ассетов.')
      return false
    } finally {
      setStatus('idle')
    }
  }, [])

  const startIndexing = useCallback(async (sourceId: AssetLibrarySourceId): Promise<boolean> => {
    setStatus('working')
    setLastError(null)
    try {
      const result = await desktopApi.assetLibrary.startIndexing(sourceId)
      if (!result.ok) {
        setLastError(messageForStartFailure(result))
        return false
      }
      setSnapshot(result.snapshot)
      return true
    } catch {
      setLastError('Не удалось запустить повторное сканирование.')
      return false
    } finally {
      setStatus('idle')
    }
  }, [])

  const cancelIndexing = useCallback(async (): Promise<void> => {
    setStatus('working')
    try {
      const result = await desktopApi.assetLibrary.cancelIndexing()
      setSnapshot(result.snapshot)
    } catch {
      setLastError('Не удалось остановить индексацию.')
    } finally {
      setStatus('idle')
    }
  }, [])

  return {
    snapshot,
    status,
    lastError,
    refresh,
    connectDirectory,
    startIndexing,
    cancelIndexing,
  }
}

function messageForConnectFailure(result: Extract<ConnectAssetLibraryResult, { ok: false }>): string {
  if (result.reason === 'desktop-api-unavailable') {
    return 'Подключение папок доступно в настольном приложении.'
  }
  if (result.reason === 'source-unavailable') {
    return 'Выбранная папка недоступна.'
  }
  if (result.reason === 'indexing-in-progress') {
    return 'Дождитесь завершения текущей индексации.'
  }
  return 'Не удалось сохранить источник общей библиотеки.'
}

function messageForStartFailure(result: Extract<StartAssetIndexResult, { ok: false }>): string {
  if (result.reason === 'desktop-api-unavailable') {
    return 'Сканирование папок доступно в настольном приложении.'
  }
  if (result.reason === 'source-unavailable') {
    return 'Папка библиотеки сейчас недоступна.'
  }
  if (result.reason === 'source-not-found') {
    return 'Источник библиотеки не найден.'
  }
  if (result.reason === 'indexing-in-progress') {
    return 'Индексация уже выполняется.'
  }
  return 'Не удалось запустить индексацию каталога.'
}
