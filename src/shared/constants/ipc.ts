export const IPC_CHANNELS = {
  storage: {
    listCampaigns: 'storage:listCampaigns',
    loadCampaign: 'storage:loadCampaign',
    saveCampaign: 'storage:saveCampaign',
    deleteCampaign: 'storage:deleteCampaign',
  },
  playerScreen: {
    open: 'playerScreen:open',
  },
} as const
