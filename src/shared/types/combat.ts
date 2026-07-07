import type { CharacterCardId } from './characterCard.js'
import type { CampaignId, EntityId } from './common.js'
import type { TokenId } from './token.js'

export interface CombatParticipant {
  id: EntityId
  name: string
  initiative: number
  tokenId?: TokenId
  characterCardId?: CharacterCardId
  isPlayerControlled: boolean
  isDefeated: boolean
}

export interface CombatState {
  campaignId: CampaignId
  isActive: boolean
  round: number
  turnIndex: number
  participants: CombatParticipant[]
}
