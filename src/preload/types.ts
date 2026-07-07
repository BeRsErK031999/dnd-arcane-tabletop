import type { Campaign, CampaignId, CampaignSummary, PlayerScreenOpenResult } from '../shared/types/index.js'

export interface DesktopApi {
  storage: {
    listCampaigns(): Promise<CampaignSummary[]>
    loadCampaign(campaignId: CampaignId): Promise<Campaign | null>
    saveCampaign(campaign: Campaign): Promise<void>
    deleteCampaign(campaignId: CampaignId): Promise<void>
  }
  playerScreen: {
    open(): Promise<PlayerScreenOpenResult>
  }
}
