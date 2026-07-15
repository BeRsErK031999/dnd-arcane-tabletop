import type { Campaign, CampaignSummary } from './types/index.js'

export function createCampaignSummary(campaign: Campaign): CampaignSummary {
  const previewScene = campaign.scenes.find((scene) => scene.isActive) ?? campaign.scenes[0]
  const previewAsset = previewScene?.backgroundAssetId
    ? campaign.assets.find((asset) => asset.id === previewScene.backgroundAssetId)
    : undefined

  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    ...(previewAsset ? { previewImagePath: previewAsset.filePath } : {}),
    updatedAt: campaign.updatedAt,
    sceneCount: campaign.scenes.length,
    assetCount: campaign.assets.length,
    characterCount: campaign.characterCards.length,
  }
}
