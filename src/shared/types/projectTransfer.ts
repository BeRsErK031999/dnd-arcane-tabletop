import type { AssetId, AssetKind } from './asset.js'
import type { Campaign } from './campaign.js'
import type { CampaignId } from './common.js'

export type ProjectTransferFailureReason =
  | 'cancelled'
  | 'campaign-not-found'
  | 'invalid-package'
  | 'unsupported-version'
  | 'unsupported-asset-path'
  | 'asset-read-failed'
  | 'preview-outdated'
  | 'read-failed'
  | 'write-failed'
  | 'desktop-api-unavailable'

export type ProjectExportAssetInclusion = 'used' | 'always'
export type ProjectExportAssetStorage = 'managed' | 'legacy-file' | 'embedded-data'

export interface ProjectExportAssetPreview {
  assetId: AssetId
  name: string
  kind: AssetKind
  inclusion: ProjectExportAssetInclusion
  storage: ProjectExportAssetStorage
  byteSize: number
  sha256: string
  mimeType: string
}

export interface ProjectExportPreview {
  token: string
  campaignId: CampaignId
  campaignName: string
  campaignUpdatedAt: string
  generatedAt: string
  assets: ProjectExportAssetPreview[]
  usedAssetCount: number
  additionalAssetCount: number
  embeddedAssetCount: number
  uniqueBlobCount: number
  totalByteSize: number
}

export type ProjectExportPreviewResult =
  | { ok: true; preview: ProjectExportPreview }
  | { ok: false; reason: ProjectTransferFailureReason }

export type ProjectExportResult =
  | {
      ok: true
      campaignId: CampaignId
      filePath: string
      exportedAssetCount: number
      exportedBlobCount: number
      totalByteSize: number
    }
  | {
      ok: false
      reason: ProjectTransferFailureReason
    }

export type ProjectImportResult =
  | {
      ok: true
      campaign: Campaign
      filePath: string
      importedAssetCount: number
      importedBlobCount: number
      deduplicatedBlobCount: number
      skippedBlobCount: number
      damagedBlobCount: number
      packageVersion: 1 | 2
      campaignIdChanged: boolean
    }
  | {
      ok: false
      reason: ProjectTransferFailureReason
      damagedBlobCount?: number
    }
