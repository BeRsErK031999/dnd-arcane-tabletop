import type { AssetId } from './asset.js'
import type { CampaignId, EntityId } from './common.js'

export type CharacterCardId = EntityId

export interface CharacterCard {
  id: CharacterCardId
  campaignId: CampaignId
  name: string
  playerName?: string
  armorClass?: number
  hitPoints?: {
    current: number
    maximum: number
    temporary?: number
  }
  initiativeModifier?: number
  portraitAssetId?: AssetId
  notes?: string
}
