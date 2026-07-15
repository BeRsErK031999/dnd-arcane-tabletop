import type { Campaign } from './campaign.js'
import type { CampaignId } from './common.js'

export type ProjectTransferFailureReason =
  | 'cancelled'
  | 'campaign-not-found'
  | 'invalid-package'
  | 'unsupported-version'
  | 'unsupported-asset-path'
  | 'asset-read-failed'
  | 'read-failed'
  | 'write-failed'
  | 'desktop-api-unavailable'

export type ProjectExportResult =
  | {
      ok: true
      campaignId: CampaignId
      filePath: string
      exportedAssetCount: number
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
      campaignIdChanged: boolean
    }
  | {
      ok: false
      reason: ProjectTransferFailureReason
    }
