import type { AssetId } from './asset.js'
import type { CampaignId, EntityId, IsoDateString } from './common.js'

export type CharacterCardId = EntityId
export type CharacterCardKind = 'player' | 'npc' | 'monster'

export interface CharacterCard {
  id: CharacterCardId
  campaignId: CampaignId
  kind: CharacterCardKind
  name: string
  playerName?: string
  description?: string
  armorClass?: number
  hitPoints?: {
    current: number
    maximum: number
    temporary?: number
  }
  initiativeModifier?: number
  portraitAssetId?: AssetId
  notes?: string
  createdAt: IsoDateString
  updatedAt: IsoDateString
}
