import type { CampaignSummary } from './campaign.js'

export interface CampaignsDirectoryInfo {
  path: string
}

export interface CampaignsDirectorySelectionResult {
  canceled: boolean
  directory: CampaignsDirectoryInfo
  campaigns: CampaignSummary[]
}
