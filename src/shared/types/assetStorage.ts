import type { AssetId, ImageAssetKind } from './asset.js'
import type { CampaignId, EntityId, IsoDateString } from './common.js'

export type AssetLibrarySourceId = EntityId
export type IndexedAssetId = EntityId
export type Sha256Digest = string

export type AssetLibrarySourceStatus = 'idle' | 'indexing' | 'ready' | 'unavailable' | 'error'
export type IndexedAssetAvailability = 'available' | 'missing' | 'unreadable'
export type CampaignAssetExportPolicy = 'when-used' | 'always'
export type AssetIndexJobStatus = 'idle' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'
export type AssetIndexPhase = 'idle' | 'discovering' | 'processing' | 'finalizing'

export interface AssetLibrarySource {
  id: AssetLibrarySourceId
  rootPath: string
  displayName: string
  status: AssetLibrarySourceStatus
  createdAt: IsoDateString
  updatedAt: IsoDateString
  lastScanStartedAt?: IsoDateString
  lastScanCompletedAt?: IsoDateString
  lastError?: string
}

export interface IndexedAsset {
  id: IndexedAssetId
  sourceId: AssetLibrarySourceId
  canonicalPath: string
  relativePath: string
  fileName: string
  byteSize: number
  modifiedAt: IsoDateString
  kind: ImageAssetKind
  mimeType: string
  format: string
  width: number
  height: number
  sha256?: Sha256Digest
  previewPath?: string
  tags: string[]
  availability: IndexedAssetAvailability
  indexedAt: IsoDateString
}

export interface ManagedAssetBlob {
  sha256: Sha256Digest
  relativePath: string
  byteSize: number
  mimeType: string
  fileExtension: string
  createdAt: IsoDateString
  verifiedAt?: IsoDateString
}

export interface ManagedCampaignAssetReference {
  kind: 'managed'
  sha256: Sha256Digest
  fileName: string
  mimeType: string
  byteSize: number
  indexedAssetId?: IndexedAssetId
}

export interface LegacyFileCampaignAssetReference {
  kind: 'legacy-file'
  fileUrl: string
  sha256?: Sha256Digest
  indexedAssetId?: IndexedAssetId
}

export interface EmbeddedDataCampaignAssetReference {
  kind: 'embedded-data'
  dataUrl?: string
}

export type CampaignAssetStorageReference =
  | ManagedCampaignAssetReference
  | LegacyFileCampaignAssetReference
  | EmbeddedDataCampaignAssetReference

export interface CampaignAssetBinding {
  campaignId: CampaignId
  assetId: AssetId
  storage: CampaignAssetStorageReference
  exportPolicy: CampaignAssetExportPolicy
  createdAt: IsoDateString
  updatedAt: IsoDateString
}

export interface AssetIndexProgress {
  status: AssetIndexJobStatus
  phase: AssetIndexPhase
  sourceId?: AssetLibrarySourceId
  sourceName?: string
  discoveredCount: number
  processedCount: number
  indexedCount: number
  skippedCount: number
  errorCount: number
  currentFileName?: string
  startedAt?: IsoDateString
  finishedAt?: IsoDateString
  message?: string
}

export interface AssetLibrarySnapshot {
  sources: AssetLibrarySource[]
  progress: AssetIndexProgress
}

export interface AssetLibraryQuery {
  sourceIds?: AssetLibrarySourceId[]
  search?: string
  tags?: string[]
  formats?: string[]
  availability?: IndexedAssetAvailability[]
  minByteSize?: number
  maxByteSize?: number
  offset: number
  limit: number
}

export interface AssetLibraryItem extends IndexedAsset {
  fileUrl?: string
  previewUrl?: string
}

export interface AssetLibraryPage {
  items: AssetLibraryItem[]
  total: number
  offset: number
  limit: number
}

export type UpdateIndexedAssetTagsResult =
  | { ok: true; asset: AssetLibraryItem }
  | {
      ok: false
      reason: 'asset-not-found' | 'storage-failed' | 'desktop-api-unavailable'
    }

export type ConnectAssetLibraryResult =
  | {
      ok: true
      source: AssetLibrarySource
      snapshot: AssetLibrarySnapshot
    }
  | {
      ok: false
      reason:
        | 'cancelled'
        | 'source-unavailable'
        | 'indexing-in-progress'
        | 'storage-failed'
        | 'desktop-api-unavailable'
    }

export type StartAssetIndexResult =
  | { ok: true; snapshot: AssetLibrarySnapshot }
  | {
      ok: false
      reason:
        | 'source-not-found'
        | 'source-unavailable'
        | 'indexing-in-progress'
        | 'storage-failed'
        | 'desktop-api-unavailable'
    }

export type CancelAssetIndexResult = { ok: true; snapshot: AssetLibrarySnapshot }
