import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type {
  AssetLibrarySnapshot,
  AssetLibrarySource,
  AssetLibrarySourceId,
  CancelAssetIndexResult,
  ConnectAssetLibraryResult,
  StartAssetIndexResult,
} from '../../shared/types/index.js'
import type { AssetIndexService } from './hybridStorageContracts.js'
import { AssetLibraryIndexer } from './indexing/AssetLibraryIndexer.js'

export type AssetLibrarySnapshotListener = (snapshot: AssetLibrarySnapshot) => void

export class AssetLibraryService {
  constructor(
    private readonly catalog: AssetIndexService,
    private readonly indexer: AssetLibraryIndexer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async initialize(): Promise<void> {
    await this.catalog.initialize()
    const sources = await this.catalog.listSources()
    for (const source of sources.filter((candidate) => candidate.status === 'indexing')) {
      await this.catalog.saveSource({
        ...source,
        status: 'idle',
        updatedAt: this.now().toISOString(),
        lastError: 'Предыдущая индексация была прервана. Запустите сканирование повторно.',
      })
    }
  }

  async getSnapshot(): Promise<AssetLibrarySnapshot> {
    return {
      sources: await this.catalog.listSources(),
      progress: this.indexer.getProgress(),
    }
  }

  subscribe(listener: AssetLibrarySnapshotListener): () => void {
    return this.indexer.subscribe(() => {
      void this.getSnapshot().then(listener).catch(() => undefined)
    })
  }

  async connectDirectory(rootPath: string): Promise<ConnectAssetLibraryResult> {
    if (this.indexer.isRunning()) {
      return { ok: false, reason: 'indexing-in-progress' }
    }

    const canonicalRootPath = path.resolve(rootPath)
    if (!(await isAvailableDirectory(canonicalRootPath))) {
      return { ok: false, reason: 'source-unavailable' }
    }

    try {
      const timestamp = this.now().toISOString()
      const existingSource = await this.catalog.findSourceByRootPath(canonicalRootPath)
      const source: AssetLibrarySource = existingSource ?? {
        id: createSourceId(canonicalRootPath),
        rootPath: canonicalRootPath,
        displayName: path.basename(canonicalRootPath) || canonicalRootPath,
        status: 'idle',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.catalog.saveSource({
        ...source,
        status: 'idle',
        updatedAt: timestamp,
        lastError: undefined,
      })
      const started = await this.indexer.start(source)
      if (!started) {
        return { ok: false, reason: 'indexing-in-progress' }
      }
      return {
        ok: true,
        source,
        snapshot: await this.getSnapshot(),
      }
    } catch {
      return { ok: false, reason: 'storage-failed' }
    }
  }

  async startIndexing(sourceId: AssetLibrarySourceId): Promise<StartAssetIndexResult> {
    if (this.indexer.isRunning()) {
      return { ok: false, reason: 'indexing-in-progress' }
    }

    try {
      const source = await this.catalog.getSource(sourceId)
      if (!source) {
        return { ok: false, reason: 'source-not-found' }
      }
      if (!(await isAvailableDirectory(source.rootPath))) {
        const timestamp = this.now().toISOString()
        await this.catalog.saveSource({
          ...source,
          status: 'unavailable',
          updatedAt: timestamp,
          lastError: 'Папка библиотеки недоступна.',
        })
        return { ok: false, reason: 'source-unavailable' }
      }
      const started = await this.indexer.start(source)
      if (!started) {
        return { ok: false, reason: 'indexing-in-progress' }
      }
      return { ok: true, snapshot: await this.getSnapshot() }
    } catch {
      return { ok: false, reason: 'storage-failed' }
    }
  }

  async cancelIndexing(): Promise<CancelAssetIndexResult> {
    this.indexer.cancel()
    return { ok: true, snapshot: await this.getSnapshot() }
  }
}

function createSourceId(rootPath: string): AssetLibrarySourceId {
  const normalizedPath = rootPath.toLocaleLowerCase('en-US')
  return `asset-source-${createHash('sha256').update(normalizedPath).digest('hex').slice(0, 32)}`
}

async function isAvailableDirectory(directoryPath: string): Promise<boolean> {
  try {
    return (await stat(directoryPath)).isDirectory()
  } catch {
    return false
  }
}
