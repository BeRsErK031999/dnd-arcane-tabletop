import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
  AssetLibraryItem,
  AssetLibraryPage,
  AssetLibraryQuery,
  AssetLibrarySnapshot,
  AssetLibrarySource,
  AssetLibrarySourceId,
  CancelAssetIndexResult,
  ConnectAssetLibraryResult,
  IndexedAsset,
  StartAssetIndexResult,
  UpdateIndexedAssetTagsResult,
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

  async queryAssets(query: AssetLibraryQuery): Promise<AssetLibraryPage> {
    const page = await this.catalog.queryAssets(normalizeQuery(query))
    return {
      ...page,
      items: page.items.map(toLibraryItem),
    }
  }

  async updateTags(assetId: string, tags: string[]): Promise<UpdateIndexedAssetTagsResult> {
    try {
      const asset = await this.catalog.getAsset(assetId)
      if (!asset) {
        return { ok: false, reason: 'asset-not-found' }
      }
      await this.catalog.updateTags(assetId, normalizeTags(tags))
      const updatedAsset = await this.catalog.getAsset(assetId)
      return updatedAsset
        ? { ok: true, asset: toLibraryItem(updatedAsset) }
        : { ok: false, reason: 'asset-not-found' }
    } catch {
      return { ok: false, reason: 'storage-failed' }
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

function normalizeQuery(query: AssetLibraryQuery): AssetLibraryQuery {
  const availability = query.availability?.filter(
    (value) => value === 'available' || value === 'missing' || value === 'unreadable',
  )
  return {
    sourceIds: normalizeStrings(query.sourceIds, 100, 200),
    search: typeof query.search === 'string' ? query.search.trim().slice(0, 200) : undefined,
    tags: normalizeStrings(query.tags, 20, 64),
    formats: normalizeStrings(query.formats, 20, 20)?.map((format) => format.toLocaleLowerCase('en-US')),
    availability: availability && availability.length > 0 ? [...new Set(availability)] : undefined,
    minByteSize: normalizeByteSize(query.minByteSize),
    maxByteSize: normalizeByteSize(query.maxByteSize),
    offset: normalizeInteger(query.offset, 0, Number.MAX_SAFE_INTEGER, 0),
    limit: normalizeInteger(query.limit, 1, 2_000, 200),
  }
}

function normalizeStrings(
  values: readonly string[] | undefined,
  maxItems: number,
  maxLength: number,
): string[] | undefined {
  if (!values) {
    return undefined
  }
  const normalized = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .slice(0, maxItems)
    .map((value) => value.slice(0, maxLength))
  return normalized.length > 0 ? normalized : undefined
}

function normalizeTags(tags: readonly string[]): string[] {
  return normalizeStrings(tags, 30, 64)?.sort((left, right) => left.localeCompare(right, 'ru')) ?? []
}

function normalizeByteSize(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) {
    return undefined
  }
  return normalizeInteger(value, 0, Number.MAX_SAFE_INTEGER, 0)
}

function normalizeInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return Math.max(min, Math.min(max, Math.trunc(value)))
}

function toLibraryItem(asset: IndexedAsset): AssetLibraryItem {
  return {
    ...asset,
    ...(asset.availability === 'available'
      ? { fileUrl: pathToFileURL(asset.canonicalPath).toString() }
      : {}),
    ...(asset.previewPath ? { previewUrl: pathToFileURL(asset.previewPath).toString() } : {}),
  }
}
