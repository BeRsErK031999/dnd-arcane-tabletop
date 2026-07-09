import type {
  Campaign,
  CampaignId,
  CampaignSummary,
  CampaignsDirectoryInfo,
  CampaignsDirectorySelectionResult,
  ImportImageAssetRequest,
  ImportImageAssetResult,
  PlayerScreenCommandResult,
  PlayerScreenOpenResult,
  PlayerScreenState,
  PlayerScreenStatus,
} from '../shared/types/index.js'

export type DesktopEventUnsubscribe = () => void

export interface DesktopApi {
  storage: {
    getCampaignsDirectory(): Promise<CampaignsDirectoryInfo>
    selectCampaignsDirectory(): Promise<CampaignsDirectorySelectionResult>
    saveCampaignToDirectory(campaign: Campaign): Promise<CampaignsDirectorySelectionResult>
    listCampaigns(): Promise<CampaignSummary[]>
    loadCampaign(campaignId: CampaignId): Promise<Campaign | null>
    saveCampaign(campaign: Campaign): Promise<void>
    deleteCampaign(campaignId: CampaignId): Promise<void>
  }
  assets: {
    importImageAsset(request: ImportImageAssetRequest): Promise<ImportImageAssetResult>
  }
  playerScreen: {
    open(): Promise<PlayerScreenOpenResult>
    close(): Promise<PlayerScreenCommandResult>
    focus(): Promise<PlayerScreenCommandResult>
    getStatus(): Promise<PlayerScreenStatus>
    setFullscreen(isFullscreen: boolean): Promise<PlayerScreenCommandResult>
    toggleFullscreen(): Promise<PlayerScreenCommandResult>
    getState(): Promise<PlayerScreenState>
    updateState(state: PlayerScreenState): Promise<PlayerScreenCommandResult>
    resetState(): Promise<PlayerScreenCommandResult>
    hide(): Promise<PlayerScreenCommandResult>
    show(): Promise<PlayerScreenCommandResult>
    onStateUpdated(listener: (state: PlayerScreenState) => void): DesktopEventUnsubscribe
    onStatusChanged(listener: (status: PlayerScreenStatus) => void): DesktopEventUnsubscribe
  }
}
