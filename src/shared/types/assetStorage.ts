import type { AssetId, ImageAssetKind } from './asset.js'
import type { CampaignId, EntityId, IsoDateString } from './common.js'

export type AssetLibrarySourceId = EntityId
export type IndexedAssetId = EntityId
export type Sha256Digest = string

export type AssetLibrarySourceStatus = 'idle' | 'indexing' | 'ready' | 'unavailable' | 'error'
export type IndexedAssetAvailability = 'available' | 'missing' | 'unreadable'
export type CampaignAssetExportPolicy = 'when-used' | 'always'

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
