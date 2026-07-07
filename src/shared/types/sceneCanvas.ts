import type { AssetId } from './asset.js'
import type { EntityId, IsoDateString } from './common.js'

export type SceneCanvasLayerId = EntityId
export type SceneCanvasObjectId = EntityId

export type SceneCanvasLayerKind = 'map' | 'grid' | 'object' | 'token' | 'master' | 'fog'
export type SceneCanvasLayerVisibility = 'player-visible' | 'master-only' | 'disabled'
export type SceneCanvasObjectKind = 'marker' | 'note' | 'shape' | 'token-placeholder'

export interface SceneCanvasLayer {
  id: SceneCanvasLayerId
  kind: SceneCanvasLayerKind
  name: string
  visibility: SceneCanvasLayerVisibility
  zIndex: number
  opacity: number
  locked: boolean
}

export interface SceneCanvasObject {
  id: SceneCanvasObjectId
  layerId: SceneCanvasLayerId
  kind: SceneCanvasObjectKind
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  color: string
  text?: string
  assetId?: AssetId
  isPlayerVisible: boolean
}

export interface SceneCanvasState {
  width: number
  height: number
  layers: SceneCanvasLayer[]
  objects: SceneCanvasObject[]
  updatedAt: IsoDateString
}

export interface SceneCanvasGridProjection {
  enabled: boolean
  size: number
  color: string
  opacity: number
}

export interface PlayerSceneCanvasAsset {
  id: AssetId
  name: string
  filePath: string
}

export interface PlayerSceneCanvasLayer {
  id: SceneCanvasLayerId
  kind: SceneCanvasLayerKind
  name: string
  zIndex: number
  opacity: number
}

export interface PlayerSceneCanvasObject {
  id: SceneCanvasObjectId
  kind: SceneCanvasObjectKind
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  color: string
  text?: string
  assetId?: AssetId
}

export interface PlayerSceneCanvasProjection {
  width: number
  height: number
  grid: SceneCanvasGridProjection
  backgroundAsset?: PlayerSceneCanvasAsset
  layers: PlayerSceneCanvasLayer[]
  objects: PlayerSceneCanvasObject[]
  updatedAt: IsoDateString
}
