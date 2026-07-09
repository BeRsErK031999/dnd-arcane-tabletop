import type { Campaign, CampaignId, CampaignSummary } from '../../shared/types/index.js'

export interface StorageService {
  initialize(): Promise<void>
  getCampaignsDirectory(): string
  setCampaignsDirectory(campaignsDirectory: string): Promise<void>
  listCampaigns(): Promise<CampaignSummary[]>
  loadCampaign(campaignId: CampaignId): Promise<Campaign | null>
  saveCampaign(campaign: Campaign): Promise<void>
  deleteCampaign(campaignId: CampaignId): Promise<void>
}
