import type { AssetId } from './asset.js'
import type { CampaignId, IsoDateString } from './common.js'
import type { SceneId } from './scene.js'
import type { TokenId } from './token.js'

export interface PlayerScreenState {
  campaignId?: CampaignId
  activeSceneId?: SceneId
  visibleTokenIds: TokenId[]
  revealedAssetIds: AssetId[]
  showInitiativeTracker: boolean
  updatedAt: IsoDateString
}

export interface PlayerScreenOpenResult {
  opened: boolean
  reason?: string
}
