import type { Asset } from './asset.js'
import type { CharacterCard } from './characterCard.js'
import type { CombatState } from './combat.js'
import type { CampaignId, IsoDateString } from './common.js'
import type { Note } from './note.js'
import type { PlayerScreenState } from './playerScreen.js'
import type { Scene } from './scene.js'

export interface Campaign {
  id: CampaignId
  name: string
  description?: string
  createdAt: IsoDateString
  updatedAt: IsoDateString
  scenes: Scene[]
  assets: Asset[]
  characterCards: CharacterCard[]
  notes: Note[]
  combatState: CombatState
  playerScreenState: PlayerScreenState
}

export interface CampaignSummary {
  id: CampaignId
  name: string
  description?: string
  previewImagePath?: string
  updatedAt: IsoDateString
  sceneCount: number
  assetCount: number
  characterCount: number
}
