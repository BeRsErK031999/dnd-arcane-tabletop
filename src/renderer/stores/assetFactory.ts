import type { Asset, AssetId, Campaign, IsoDateString, PlayerScreenState } from '@shared/types'
import { getActiveCampaignScene } from './sceneFactory'

export function createCampaignWithImportedAsset(
  campaign: Campaign,
  asset: Asset,
  updatedAt: IsoDateString = new Date().toISOString(),
): Campaign {
  const activeScene = getActiveCampaignScene(campaign)

  return {
    ...campaign,
    updatedAt,
    assets: [...campaign.assets, asset],
    scenes:
      asset.kind === 'map' && activeScene
        ? campaign.scenes.map((scene) =>
            scene.id === activeScene.id
              ? {
                  ...scene,
                  backgroundAssetId: asset.id,
                }
              : scene,
          )
        : campaign.scenes,
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
  return {
    ...campaign.playerScreenState,
    mode: 'image',
    isHidden: false,
    title: asset.name,
    message: asset.kind === 'map' ? 'Карта готова к показу игрокам.' : 'Материал готов к показу игрокам.',
    campaignId: campaign.id,
    handoutPreview: {
      id: asset.id,
      name: asset.name,
      description: createAssetDescription(asset),
      kind: asset.kind === 'map' ? 'image' : 'handout',
      sourceLabel: getAssetKindLabel(asset.kind),
    },
    revealedAssetIds: [asset.id],
    updatedAt,
  }
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

  return asset
}
