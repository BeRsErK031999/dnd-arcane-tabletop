import type {
  Asset,
  AssetLibraryQuery,
  AssetLibrarySource,
  AssetLibrarySourceId,
  CampaignAssetStorageReference,
  IndexedAsset,
  IndexedAssetId,
  ManagedAssetBlob,
  Sha256Digest,
} from '../../shared/types/index.js'

export type IndexedAssetQuery = AssetLibraryQuery

export interface IndexedAssetPage {
  items: IndexedAsset[]
  total: number
  offset: number
  limit: number
}

export interface AssetIndexService {
  initialize(): Promise<void>
  listSources(): Promise<AssetLibrarySource[]>
  getSource(sourceId: AssetLibrarySourceId): Promise<AssetLibrarySource | null>
  findSourceByRootPath(rootPath: string): Promise<AssetLibrarySource | null>
  saveSource(source: AssetLibrarySource): Promise<void>
  removeSource(sourceId: AssetLibrarySourceId): Promise<void>
  getAsset(assetId: IndexedAssetId): Promise<IndexedAsset | null>
  getAssetByCanonicalPath(sourceId: AssetLibrarySourceId, canonicalPath: string): Promise<IndexedAsset | null>
  findBySha256(sha256: Sha256Digest): Promise<IndexedAsset[]>
  queryAssets(query: IndexedAssetQuery): Promise<IndexedAssetPage>
  saveAsset(asset: IndexedAsset): Promise<void>
  saveAssets(assets: IndexedAsset[], scanId?: string): Promise<void>
  markSourceAssetsMissing(sourceId: AssetLibrarySourceId, completedScanId: string): Promise<void>
  updateTags(assetId: IndexedAssetId, tags: string[]): Promise<void>
}

export interface PutManagedAssetInput {
  sourceFilePath: string
  sha256: Sha256Digest
  byteSize: number
  mimeType: string
  fileExtension: string
}

export interface ManagedAssetStore {
  put(input: PutManagedAssetInput): Promise<ManagedAssetBlob>
  get(sha256: Sha256Digest): Promise<ManagedAssetBlob | null>
  resolveFileUrl(sha256: Sha256Digest): Promise<string | null>
  verify(sha256: Sha256Digest): Promise<boolean>
}

export type CampaignAssetResolution =
  | {
      ok: true
      fileUrl: string
      origin: CampaignAssetStorageReference['kind']
      sha256?: Sha256Digest
    }
  | {
      ok: false
      reason: 'unsupported-reference' | 'invalid-reference' | 'managed-blob-not-found'
    }

export interface CampaignAssetResolver {
  resolve(asset: Asset): Promise<CampaignAssetResolution>
}
