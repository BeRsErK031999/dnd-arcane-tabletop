import type { AssetId } from './asset.js'
import type { CampaignId, EntityId } from './common.js'
import type { SceneCanvasState } from './sceneCanvas.js'
import type { Token } from './token.js'

export type SceneId = EntityId

export interface SceneGrid {
  enabled: boolean
  size: number
  color: string
  opacity: number
  distancePerCell: number
  unitLabel: string
  snapToGrid: boolean
}

export interface Scene {
  id: SceneId
  campaignId: CampaignId
  name: string
  description?: string
  backgroundAssetId?: AssetId
  canvas: SceneCanvasState
  tokens: Token[]
  grid: SceneGrid
  isActive: boolean
}
