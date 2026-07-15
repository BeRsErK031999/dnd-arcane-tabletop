import type {
  Asset,
  AssetId,
  AssetKind,
  AssetLibraryItem,
  Campaign,
  CampaignAssetExportPolicy,
  ImageAssetKind,
  IsoDateString,
  ManageIndexedAssetForCampaignResult,
  PlayerScreenState,
  Scene,
  SceneCanvasObject,
  SceneGrid,
} from '@shared/types'
import { getSceneCanvasState } from './sceneCanvasFactory'
import { createSceneWithHydratedState, getActiveCampaignScene } from './sceneFactory'

export type AssetLibraryKindFilter = AssetKind | 'all'

export interface AssetLibraryFilters {
  searchQuery?: string
  kind?: AssetLibraryKindFilter
  selectedTags?: string[]
}

export interface AssetLibraryTag {
  name: string
  count: number
}

export interface AssetLibraryView {
  assets: Asset[]
  tags: AssetLibraryTag[]
}

export function createCampaignWithImportedAsset(
  campaign: Campaign,
  asset: Asset,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const activeScene = getActiveCampaignScene(campaign)
  const hydratedScenes = campaign.scenes.map(createSceneWithHydratedState)
  const normalizedAsset = normalizeAsset(asset)

  return {
    ...campaign,
    updatedAt,
    assets: [...campaign.assets.map(normalizeAsset), normalizedAsset],
    scenes:
      normalizedAsset.kind === 'map' && activeScene
        ? hydratedScenes.map((scene) =>
            scene.id === activeScene.id
              ? {
                  ...scene,
                  backgroundAssetId: normalizedAsset.id,
                }
              : scene,
          )
        : hydratedScenes,
  }
}

export function createCampaignWithIndexedAsset(
  campaign: Campaign,
  indexedAsset: AssetLibraryItem,
  managedSelection: Extract<ManageIndexedAssetForCampaignResult, { ok: true }>,
  kind: ImageAssetKind,
  exportPolicy: CampaignAssetExportPolicy,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  if (
    !indexedAsset.sha256 ||
    managedSelection.storageRef.sha256 !== indexedAsset.sha256
  ) {
    throw new Error('managed-asset-selection-invalid')
  }

  const existingAsset = campaign.assets.find(
    (asset) =>
      asset.storageRef?.kind !== 'embedded-data' && asset.storageRef?.indexedAssetId === indexedAsset.id,
  )
  if (existingAsset && existingAsset.id !== managedSelection.assetId) {
    throw new Error('indexed-asset-id-mismatch')
  }
  const libraryAsset: Asset = {
    id: managedSelection.assetId,
    campaignId: campaign.id,
    kind,
    name: existingAsset?.name ?? createAssetName(indexedAsset.fileName),
    filePath: managedSelection.fileUrl,
    storageRef: managedSelection.storageRef,
    exportPolicy,
    tags: normalizeAssetTags(indexedAsset.tags),
    createdAt: existingAsset?.createdAt ?? updatedAt,
    metadata: {
      originalFileName: indexedAsset.fileName,
      relativePath: indexedAsset.relativePath,
      byteSize: indexedAsset.byteSize,
      width: indexedAsset.width,
      height: indexedAsset.height,
      mimeType: indexedAsset.mimeType,
      format: indexedAsset.format,
    },
  }

  return {
    ...campaign,
    updatedAt,
    assets: existingAsset
      ? campaign.assets.map((asset) => (asset.id === existingAsset.id ? libraryAsset : normalizeAsset(asset)))
      : [...campaign.assets.map(normalizeAsset), libraryAsset],
  }
}

export function createAssetLibraryView(assets: Asset[], filters: AssetLibraryFilters = {}): AssetLibraryView {
  const normalizedAssets = assets.map(normalizeAsset)
  const searchQuery = normalizeSearchQuery(filters.searchQuery)
  const kindFilter = filters.kind ?? 'all'
  const selectedTags = normalizeAssetTags(filters.selectedTags)
  const filteredAssets = normalizedAssets
    .filter((asset) => kindFilter === 'all' || asset.kind === kindFilter)
    .filter((asset) => selectedTags.every((tag) => asset.tags.includes(tag)))
    .filter((asset) => searchQuery === '' || createAssetSearchText(asset).includes(searchQuery))
    .sort(sortAssetsByCreatedAt)

  return {
    assets: filteredAssets,
    tags: createAssetTags(normalizedAssets),
  }
}

export function createCampaignWithAssetTags(
  campaign: Campaign,
  assetId: AssetId,
  tags: string[] | string,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  findAssetOrThrow(campaign, assetId)

  return {
    ...campaign,
    updatedAt,
    assets: campaign.assets.map((asset) =>
      asset.id === assetId
        ? {
            ...normalizeAsset(asset),
            tags: normalizeAssetTags(tags),
          }
        : normalizeAsset(asset),
    ),
  }
}

export function createCampaignWithAssetInActiveScene(
  campaign: Campaign,
  assetId: AssetId,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const asset = findAssetOrThrow(campaign, assetId)
  const hydratedScenes = campaign.scenes.map(createSceneWithHydratedState)
  const activeScene = getActiveCampaignScene({
    ...campaign,
    scenes: hydratedScenes,
  })

  if (activeScene === null) {
    throw new Error('scene-not-selected')
  }

  return {
    ...campaign,
    updatedAt,
    assets: campaign.assets.map(normalizeAsset),
    scenes: hydratedScenes.map((scene) => {
      if (scene.id !== activeScene.id) {
        return scene
      }

      if (asset.kind === 'map') {
        return {
          ...scene,
          backgroundAssetId: asset.id,
        }
      }

      return createSceneWithAssetObject(scene, asset, updatedAt)
    }),
  }
}

export function createCampaignWithAssetPreview(
  campaign: Campaign,
  assetId: AssetId,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const asset = findAssetOrThrow(campaign, assetId)

  return {
    ...campaign,
    updatedAt,
    playerScreenState: createAssetPlayerScreenState(campaign, asset, updatedAt),
  }
}

function createAssetPlayerScreenState(campaign: Campaign, asset: Asset, updatedAt: IsoDateString): PlayerScreenState {
  const normalizedAsset = normalizeAsset(asset)

  return {
    ...campaign.playerScreenState,
    mode: 'image',
    isHidden: false,
    title: normalizedAsset.name,
    message: normalizedAsset.kind === 'map' ? 'Карта готова к показу игрокам.' : 'Материал готов к показу игрокам.',
    campaignId: campaign.id,
    handoutPreview: {
      id: normalizedAsset.id,
      name: normalizedAsset.name,
      description: createAssetDescription(normalizedAsset),
      kind: normalizedAsset.kind === 'map' ? 'image' : 'handout',
      sourceLabel: getAssetKindLabel(normalizedAsset.kind),
    },
    revealedAssetIds: [normalizedAsset.id],
    updatedAt,
  }
}

function createSceneWithAssetObject(scene: Scene, asset: Asset, updatedAt: IsoDateString): Scene {
  const canvas = getSceneCanvasState(scene)
  const object = createAssetCanvasObject(asset, scene.grid, canvas.width, canvas.height)

  return {
    ...scene,
    canvas: {
      ...canvas,
      objects: [...canvas.objects, object],
      updatedAt,
    },
  }
}

function createAssetCanvasObject(
  asset: Asset,
  grid: SceneGrid,
  canvasWidth: number,
  canvasHeight: number,
): SceneCanvasObject {
  const { width, height, layerId, kind } = getAssetObjectPlacement(asset.kind, grid)

  return {
    id: createSceneAssetObjectId(),
    layerId,
    kind,
    name: asset.name,
    x: Math.round(canvasWidth / 2 - width / 2),
    y: Math.round(canvasHeight / 2 - height / 2),
    width,
    height,
    rotation: 0,
    color: getAssetObjectColor(asset.kind),
    text: asset.name,
    assetId: asset.id,
    tokenState: asset.kind === 'token' ? {} : undefined,
    isPlayerVisible: true,
  }
}

function getAssetObjectPlacement(
  kind: AssetKind,
  grid: SceneGrid,
): Pick<SceneCanvasObject, 'height' | 'kind' | 'layerId' | 'width'> {
  if (kind === 'token') {
    return {
      layerId: 'scene-layer-tokens',
      kind: 'token-placeholder',
      width: grid.size,
      height: grid.size,
    }
  }

  if (kind === 'portrait') {
    return {
      layerId: 'scene-layer-objects',
      kind: 'marker',
      width: 160,
      height: 220,
    }
  }

  return {
    layerId: 'scene-layer-objects',
    kind: 'marker',
    width: 220,
    height: 140,
  }
}

function getAssetObjectColor(kind: AssetKind): string {
  switch (kind) {
    case 'token':
      return '#2c806f'
    case 'portrait':
      return '#49625f'
    case 'handout':
      return '#9f2d3c'
    case 'other':
      return '#8b7a5a'
    case 'map':
    case 'audio':
      return '#d8a86a'
  }
}

function createSceneAssetObjectId(): string {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return `object-${randomId}`
  }

  return `object-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createAssetName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName
}

function createAssetDescription(asset: Asset): string {
  const originalFileName = asset.metadata?.originalFileName
  return typeof originalFileName === 'string' ? originalFileName : asset.filePath
}

function getAssetKindLabel(kind: Asset['kind']): string {
  switch (kind) {
    case 'map':
      return 'Map'
    case 'token':
      return 'Token'
    case 'portrait':
      return 'Portrait'
    case 'handout':
      return 'Handout'
    case 'audio':
      return 'Audio'
    case 'other':
      return 'Image'
  }
}

function findAssetOrThrow(campaign: Campaign, assetId: AssetId): Asset {
  const asset = campaign.assets.find((candidate) => candidate.id === assetId)

  if (!asset) {
    throw new Error('asset-not-found')
  }

  return normalizeAsset(asset)
}

function normalizeAsset(asset: Asset): Asset {
  return {
    ...asset,
    tags: normalizeAssetTags(asset.tags),
  }
}

export function normalizeAssetTags(tags: readonly string[] | string | undefined): string[] {
  const sourceTags = typeof tags === 'string' ? tags.split(',') : tags

  if (!Array.isArray(sourceTags)) {
    return []
  }

  return [...new Set(sourceTags.map((tag) => tag.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'ru'),
  )
}

function createAssetTags(assets: Asset[]): AssetLibraryTag[] {
  const tagCounts = new Map<string, number>()

  for (const asset of assets) {
    for (const tag of asset.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }

  return Array.from(tagCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'))
}

function createAssetSearchText(asset: Asset): string {
  return normalizeSearchQuery([
    asset.name,
    asset.kind,
    asset.tags.join(' '),
    typeof asset.metadata?.originalFileName === 'string' ? asset.metadata.originalFileName : '',
  ].join(' '))
}

function normalizeSearchQuery(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('ru') ?? ''
}

function sortAssetsByCreatedAt(left: Asset, right: Asset): number {
  return right.createdAt.localeCompare(left.createdAt)
}
