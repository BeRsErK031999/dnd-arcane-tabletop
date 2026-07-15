export const IPC_CHANNELS = {
  storage: {
    getCampaignsDirectory: 'storage:getCampaignsDirectory',
    selectCampaignsDirectory: 'storage:selectCampaignsDirectory',
    saveCampaignToDirectory: 'storage:saveCampaignToDirectory',
    listCampaigns: 'storage:listCampaigns',
    loadCampaign: 'storage:loadCampaign',
    saveCampaign: 'storage:saveCampaign',
    deleteCampaign: 'storage:deleteCampaign',
    importProject: 'storage:importProject',
    exportProject: 'storage:exportProject',
  },
  assets: {
    importImage: 'assets:importImage',
  },
  assetLibrary: {
    getSnapshot: 'asset-library:snapshot:get',
    connectDirectory: 'asset-library:directory:connect',
    startIndexing: 'asset-library:indexing:start',
    cancelIndexing: 'asset-library:indexing:cancel',
    queryAssets: 'asset-library:assets:query',
    updateTags: 'asset-library:assets:tags:update',
    manageForCampaign: 'asset-library:assets:manage-for-campaign',
    previewGarbageCollection: 'asset-library:managed:gc:preview',
    collectGarbage: 'asset-library:managed:gc:collect',
    snapshotChanged: 'asset-library:snapshot:changed',
  },
  playerScreen: {
    open: 'player:open',
    close: 'player:close',
    focus: 'player:focus',
    statusGet: 'player:status:get',
    statusChanged: 'player:status:changed',
    fullscreen: {
      set: 'player:fullscreen:set',
      toggle: 'player:fullscreen:toggle',
    },
    state: {
      get: 'player:state:get',
      update: 'player:state:update',
      reset: 'player:state:reset',
      changed: 'player:state:changed',
    },
    visibility: {
      hide: 'player:visibility:hide',
      show: 'player:visibility:show',
    },
  },
} as const
