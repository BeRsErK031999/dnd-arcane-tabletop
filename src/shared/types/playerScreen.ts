import type { AssetId } from './asset.js'
import type { PlayerInitiativeTracker } from './combat.js'
import type { CampaignId, IsoDateString } from './common.js'
import type { NoteId } from './note.js'
import type { PlayerSceneCanvasProjection } from './sceneCanvas.js'
import type { SceneId } from './scene.js'
import type { TokenId } from './token.js'

export type PlayerScreenMode = 'blank' | 'scene' | 'image' | 'split'

export interface PlayerScenePreview {
  id?: SceneId
  name: string
  description?: string
  locationLabel?: string
}

export interface PlayerHandoutPreview {
  id?: AssetId | NoteId
  name: string
  description?: string
  kind: 'image' | 'handout'
  sourceLabel?: string
}

export interface PlayerScreenState {
  mode: PlayerScreenMode
  isHidden: boolean
  title?: string
  message?: string
  scenePreview?: PlayerScenePreview
  sceneCanvas?: PlayerSceneCanvasProjection
  handoutPreview?: PlayerHandoutPreview
  initiativeVisible: boolean
  initiativeTracker?: PlayerInitiativeTracker
  campaignId?: CampaignId
  activeSceneId?: SceneId
  visibleTokenIds: TokenId[]
  revealedAssetIds: AssetId[]
  updatedAt: IsoDateString
}

export interface PlayerScreenStatus {
  isOpen: boolean
  isFullscreen: boolean
  state: PlayerScreenState
}

export interface PlayerScreenCommandResult extends PlayerScreenStatus {
  ok: boolean
  reason?: string
}

export interface PlayerScreenOpenResult {
  opened: boolean
  alreadyOpen: boolean
  reason?: string
  status: PlayerScreenStatus
}

export function createDefaultPlayerScreenState(updatedAt: IsoDateString = new Date().toISOString()): PlayerScreenState {
  return {
    mode: 'blank',
    isHidden: false,
    title: 'Экран игроков',
    message: 'Материалы для игроков пока не выбраны.',
    initiativeVisible: false,
    visibleTokenIds: [],
    revealedAssetIds: [],
    updatedAt,
  }
}
