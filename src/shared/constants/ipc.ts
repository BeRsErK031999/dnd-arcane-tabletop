export const IPC_CHANNELS = {
  storage: {
    listCampaigns: 'storage:listCampaigns',
    loadCampaign: 'storage:loadCampaign',
    saveCampaign: 'storage:saveCampaign',
    deleteCampaign: 'storage:deleteCampaign',
  },
  assets: {
    importImage: 'assets:importImage',
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
