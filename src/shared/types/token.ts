import type { AssetId } from './asset.js'
import type { CharacterCardId } from './characterCard.js'
import type { EntityId } from './common.js'
import type { SceneId } from './scene.js'

export type TokenId = EntityId

export interface Token {
  id: TokenId
  sceneId: SceneId
  name: string
  imageAssetId?: AssetId
  characterCardId?: CharacterCardId
  x: number
  y: number
  width: number
  height: number
  rotation: number
  hiddenFromPlayers: boolean
}
