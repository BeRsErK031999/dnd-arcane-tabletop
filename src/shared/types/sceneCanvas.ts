import type { AssetId } from './asset.js'
import type { CharacterCardId } from './characterCard.js'
import type { EntityId, IsoDateString } from './common.js'

export type SceneCanvasLayerId = EntityId
export type SceneCanvasObjectId = EntityId

export type SceneCanvasLayerKind = 'map' | 'grid' | 'object' | 'token' | 'master' | 'fog'
export type SceneCanvasLayerVisibility = 'player-visible' | 'master-only' | 'disabled'
export type SceneCanvasObjectKind = 'marker' | 'note' | 'shape' | 'token-placeholder'
export type SceneCanvasMeasurementId = EntityId
export type SceneCanvasMeasurementKind = 'ruler' | 'area'
export type SceneCanvasAreaShape = 'circle' | 'cone' | 'square'
export type SceneCanvasFogRegionId = EntityId
export type SceneCanvasFogRegionShape = 'rectangle' | 'circle'

export interface SceneCanvasObjectTokenState {
  characterCardId?: CharacterCardId
  hitPoints?: number
  armorClass?: number
  note?: string
}

export interface SceneCanvasViewport {
  zoom: number
  panX: number
  panY: number
}

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
  tokenState?: SceneCanvasObjectTokenState
  isPlayerVisible: boolean
}

export interface SceneCanvasMeasurement {
  id: SceneCanvasMeasurementId
  kind: SceneCanvasMeasurementKind
  shape?: SceneCanvasAreaShape
  name: string
  originX: number
  originY: number
  targetX: number
  targetY: number
  radius: number
  color: string
  label: string
  isPlayerVisible: boolean
}

export interface SceneCanvasFogRegion {
  id: SceneCanvasFogRegionId
  shape: SceneCanvasFogRegionShape
  label: string
  x: number
  y: number
  width: number
  height: number
}

export interface SceneCanvasFogState {
  enabled: boolean
  opacity: number
  regions: SceneCanvasFogRegion[]
}

export interface SceneCanvasState {
  width: number
  height: number
  viewport: SceneCanvasViewport
  layers: SceneCanvasLayer[]
  objects: SceneCanvasObject[]
  measurements: SceneCanvasMeasurement[]
  fog: SceneCanvasFogState
  updatedAt: IsoDateString
}

export interface SceneCanvasGridProjection {
  enabled: boolean
  size: number
  color: string
  opacity: number
  distancePerCell: number
  unitLabel: string
  snapToGrid: boolean
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
  asset?: PlayerSceneCanvasAsset
}

export interface PlayerSceneCanvasMeasurement {
  id: SceneCanvasMeasurementId
  kind: SceneCanvasMeasurementKind
  shape?: SceneCanvasAreaShape
  name: string
  originX: number
  originY: number
  targetX: number
  targetY: number
  radius: number
  color: string
  label: string
}

export interface PlayerSceneCanvasFogRegion {
  id: SceneCanvasFogRegionId
  shape: SceneCanvasFogRegionShape
  x: number
  y: number
  width: number
  height: number
}

export interface PlayerSceneCanvasFogProjection {
  enabled: boolean
  opacity: number
  regions: PlayerSceneCanvasFogRegion[]
}

export interface PlayerSceneCanvasProjection {
  width: number
  height: number
  viewport: SceneCanvasViewport
  grid: SceneCanvasGridProjection
  backgroundAsset?: PlayerSceneCanvasAsset
  layers: PlayerSceneCanvasLayer[]
  objects: PlayerSceneCanvasObject[]
  measurements: PlayerSceneCanvasMeasurement[]
  fog: PlayerSceneCanvasFogProjection
  updatedAt: IsoDateString
}
