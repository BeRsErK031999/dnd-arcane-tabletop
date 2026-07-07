import type { CampaignId, EntityId, IsoDateString } from './common.js'

export type AssetId = EntityId

export type AssetKind = 'map' | 'token' | 'portrait' | 'handout' | 'audio' | 'other'

export interface Asset {
  id: AssetId
  campaignId: CampaignId
  kind: AssetKind
  name: string
  filePath: string
  createdAt: IsoDateString
  metadata?: Record<string, string | number | boolean | null>
}
