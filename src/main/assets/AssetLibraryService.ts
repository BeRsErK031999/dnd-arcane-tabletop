import { createHash, randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { deriveLegacyAssetStorageReference, isSha256Digest } from '../../shared/assetStorage.js'
import type {
  AssetId,
  AssetLibraryItem,
  AssetLibraryPage,
  AssetLibraryQuery,
  AssetLibrarySnapshot,
  AssetLibrarySource,
  AssetLibrarySourceId,
  CancelAssetIndexResult,
  Campaign,
  CampaignAssetBinding,
  CollectManagedAssetGarbageResult,
  ConnectAssetLibraryResult,
  IndexedAsset,
  ManageIndexedAssetForCampaignRequest,
  ManageIndexedAssetForCampaignResult,
  ManagedAssetGarbagePlan,
  ManagedCampaignAssetReference,
  PreviewManagedAssetGarbageResult,
  StartAssetIndexResult,
  UpdateIndexedAssetTagsResult,
} from '../../shared/types/index.js'
import type { HybridAssetCatalog, ManagedAssetStore } from './hybridStorageContracts.js'
import { ManagedAssetStoreError } from './FileSystemManagedAssetStore.js'
import { AssetLibraryIndexer } from './indexing/AssetLibraryIndexer.js'

export type AssetLibrarySnapshotListener = (snapshot: AssetLibrarySnapshot) => void

export class AssetLibraryService {
  private pendingGarbagePlan: ManagedAssetGarbagePlan | null = null

  constructor(
    private readonly catalog: HybridAssetCatalog,
    private readonly indexer: AssetLibraryIndexer,
    private readonly managedAssetStore?: ManagedAssetStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async initialize(): Promise<void> {
    await this.catalog.initialize()
    await this.managedAssetStore?.initialize()
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

  async manageIndexedAssetForCampaign(
    request: ManageIndexedAssetForCampaignRequest,
  ): Promise<ManageIndexedAssetForCampaignResult> {
    if (!this.managedAssetStore) {
      return { ok: false, reason: 'storage-failed' }
    }

    try {
      const indexedAsset = await this.catalog.getAsset(request.indexedAssetId)
      if (!indexedAsset) {
        return { ok: false, reason: 'asset-not-found' }
      }
      if (!indexedAsset.sha256 || !isSha256Digest(indexedAsset.sha256)) {
        return { ok: false, reason: 'asset-checksum-missing' }
      }

      const existingBlob = await this.managedAssetStore.get(indexedAsset.sha256)
      if (indexedAsset.availability !== 'available' && !existingBlob) {
        return { ok: false, reason: 'asset-unavailable' }
      }
      const blob = await this.managedAssetStore.put({
        sourceFilePath: indexedAsset.canonicalPath,
        sha256: indexedAsset.sha256,
        byteSize: indexedAsset.byteSize,
        mimeType: indexedAsset.mimeType,
        fileExtension: path.extname(indexedAsset.fileName) || indexedAsset.format,
      })
      const fileUrl = await this.managedAssetStore.resolveFileUrl(blob.sha256)
      if (!fileUrl) {
        return { ok: false, reason: 'storage-failed' }
      }

      const assetId = normalizeAssetId(request.assetId) ?? createManagedCampaignAssetId()
      const storageRef: ManagedCampaignAssetReference = {
        kind: 'managed',
        sha256: blob.sha256,
        fileName: indexedAsset.fileName,
        mimeType: indexedAsset.mimeType,
        byteSize: indexedAsset.byteSize,
        indexedAssetId: indexedAsset.id,
      }
      const timestamp = this.now().toISOString()
      await this.catalog.saveCampaignAssetBinding({
        campaignId: request.campaignId,
        assetId,
        storage: storageRef,
        exportPolicy: request.exportPolicy,
        createdAt: timestamp,
        updatedAt: timestamp,
      })

      return {
        ok: true,
        assetId,
        blob,
        fileUrl,
        storageRef,
        deduplicated: existingBlob !== null,
      }
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof ManagedAssetStoreError && error.code === 'source-changed'
            ? 'source-changed'
            : error instanceof ManagedAssetStoreError && error.code === 'source-unavailable'
              ? 'asset-unavailable'
              : 'storage-failed',
      }
    }
  }

  async syncCampaignBindings(campaign: Campaign): Promise<void> {
    const bindings = campaign.assets.flatMap<CampaignAssetBinding>((asset) => {
      const storage = asset.storageRef ?? deriveLegacyAssetStorageReference(asset)
      return storage
        ? [{
            campaignId: campaign.id,
            assetId: asset.id,
            storage,
            exportPolicy: asset.exportPolicy ?? 'when-used',
            createdAt: asset.createdAt,
            updatedAt: campaign.updatedAt,
          }]
        : []
    })
    await this.catalog.replaceCampaignAssetBindings(campaign.id, bindings)
  }

  async removeCampaignBindings(campaignId: string): Promise<void> {
    await this.catalog.removeCampaignAssetBindings(campaignId)
  }

  async resolveCampaignAssetUrls(campaign: Campaign): Promise<Campaign> {
    const managedAssetStore = this.managedAssetStore
    if (!managedAssetStore) {
      return campaign
    }

    const assets = await Promise.all(
      campaign.assets.map(async (asset) => {
        if (asset.storageRef?.kind !== 'managed') {
          return asset
        }
        const fileUrl = await managedAssetStore.resolveFileUrl(asset.storageRef.sha256)
        return fileUrl ? { ...asset, filePath: fileUrl } : asset
      }),
    )
    return { ...campaign, assets }
  }

  async previewManagedGarbageCollection(): Promise<PreviewManagedAssetGarbageResult> {
    try {
      const candidates = await this.catalog.listUnreferencedManagedBlobs()
      const plan: ManagedAssetGarbagePlan = {
        token: randomUUID(),
        candidates,
        totalByteSize: candidates.reduce((total, candidate) => total + candidate.byteSize, 0),
        generatedAt: this.now().toISOString(),
      }
      this.pendingGarbagePlan = plan
      return { ok: true, plan }
    } catch {
      return { ok: false, reason: 'storage-failed' }
    }
  }

  async collectManagedGarbage(token: string): Promise<CollectManagedAssetGarbageResult> {
    const plan = this.pendingGarbagePlan
    this.pendingGarbagePlan = null
    if (!plan || plan.token !== token) {
      return { ok: false, reason: 'invalid-plan' }
    }
    if (!this.managedAssetStore) {
      return { ok: false, reason: 'storage-failed' }
    }

    const deletedSha256: string[] = []
    const skippedSha256: string[] = []
    let reclaimedByteSize = 0
    for (const candidate of plan.candidates) {
      try {
        const deletedBlob = await this.managedAssetStore.deleteIfUnreferenced(candidate.sha256)
        if (deletedBlob) {
          deletedSha256.push(deletedBlob.sha256)
          reclaimedByteSize += deletedBlob.byteSize
        } else {
          skippedSha256.push(candidate.sha256)
        }
      } catch {
        skippedSha256.push(candidate.sha256)
      }
    }

    return { ok: true, deletedSha256, skippedSha256, reclaimedByteSize }
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

function createManagedCampaignAssetId(): AssetId {
  return `asset-${randomUUID()}`
}

function normalizeAssetId(assetId: string | undefined): AssetId | null {
  const normalized = assetId?.trim()
  return normalized && normalized.length <= 200 ? normalized : null
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
