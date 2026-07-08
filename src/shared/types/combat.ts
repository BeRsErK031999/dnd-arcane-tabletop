import type { CharacterCardId } from './characterCard.js'
import type { CampaignId, EntityId } from './common.js'
import type { TokenId } from './token.js'

export type CombatParticipantId = EntityId

export interface CombatParticipant {
  id: CombatParticipantId
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

export interface PlayerInitiativeParticipant {
  id: CombatParticipantId
  name: string
  initiative: number
  isActive: boolean
  isPlayerControlled: boolean
  isDefeated: boolean
}

export interface PlayerInitiativeTracker {
  isActive: boolean
  round: number
  turnIndex: number
  participants: PlayerInitiativeParticipant[]
}
