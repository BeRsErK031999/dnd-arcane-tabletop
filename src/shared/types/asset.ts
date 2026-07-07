import type { CampaignId, EntityId, IsoDateString } from './common.js'

export type AssetId = EntityId

export type AssetKind = 'map' | 'token' | 'portrait' | 'handout' | 'audio' | 'other'
export type ImageAssetKind = Exclude<AssetKind, 'audio'>

export interface Asset {
  id: AssetId
  campaignId: CampaignId
  kind: AssetKind
  name: string
  filePath: string
  tags: string[]
  createdAt: IsoDateString
  metadata?: Record<string, string | number | boolean | null>
}

export interface ImportImageAssetRequest {
  campaignId: CampaignId
  kind: ImageAssetKind
  suggestedName?: string
  tags?: string[]
  sourceFilePath?: string
}

export type ImportImageAssetResult =
  | { ok: true; asset: Asset }
  | { ok: false; reason: 'cancelled' | 'unsupported-file' | 'copy-failed' }
