import type { DesktopApi } from '../../preload/types'
import {
  createDefaultPlayerScreenState,
  type Asset,
  type Campaign,
  type CampaignId,
  type CampaignSummary,
  type ImportImageAssetRequest,
  type PlayerScreenCommandResult,
  type PlayerScreenState,
  type PlayerScreenStatus,
} from '@shared/types'

const browserFallbackReason = 'desktop-api-unavailable'
const browserFallbackStateStorageKey = 'arcane-tabletop:player-screen-state'
let browserFallbackState = readStoredBrowserFallbackState() ?? createDefaultPlayerScreenState()
const browserFallbackCampaigns = new Map<CampaignId, Campaign>()
let browserFallbackAssetCounter = 0
const browserFallbackStatus: PlayerScreenStatus = {
  isOpen: false,
  isFullscreen: false,
  state: browserFallbackState,
}
const browserFallbackStateListeners = new Set<(state: PlayerScreenState) => void>()
const browserFallbackStatusListeners = new Set<(status: PlayerScreenStatus) => void>()

function createBrowserFallbackResult(ok = false, reason: string | undefined = browserFallbackReason): PlayerScreenCommandResult {
  return {
    ok,
    reason,
    ...browserFallbackStatus,
  }
}

const browserFallbackApi: DesktopApi = {
  storage: {
    listCampaigns: async () =>
      Array.from(browserFallbackCampaigns.values())
        .map(createCampaignSummary)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    loadCampaign: async (campaignId: CampaignId) => browserFallbackCampaigns.get(campaignId) ?? null,
    saveCampaign: async (campaign: Campaign) => {
      browserFallbackCampaigns.set(campaign.id, campaign)
    },
    deleteCampaign: async (campaignId: CampaignId) => {
      browserFallbackCampaigns.delete(campaignId)
    },
  },
  assets: {
    importImageAsset: async (request: ImportImageAssetRequest) => ({
      ok: true,
      asset: createBrowserFallbackAsset(request),
    }),
  },
  playerScreen: {
    open: async () => ({
      opened: false,
      alreadyOpen: false,
      reason: browserFallbackReason,
      status: browserFallbackStatus,
    }),
    close: async () => createBrowserFallbackResult(),
    focus: async () => createBrowserFallbackResult(),
    getStatus: async () => syncBrowserFallbackStateFromStorage(),
    setFullscreen: async () => createBrowserFallbackResult(),
    toggleFullscreen: async () => createBrowserFallbackResult(),
    getState: async () => syncBrowserFallbackStateFromStorage().state,
    updateState: async (state: PlayerScreenState) => updateBrowserFallbackState(state),
    resetState: async () => updateBrowserFallbackState(createDefaultPlayerScreenState()),
    hide: async () =>
      updateBrowserFallbackState({
        ...syncBrowserFallbackStateFromStorage().state,
        isHidden: true,
      }),
    show: async () =>
      updateBrowserFallbackState({
        ...syncBrowserFallbackStateFromStorage().state,
        isHidden: false,
      }),
    onStateUpdated: (listener) => {
      browserFallbackStateListeners.add(listener)
      const onStorage = (event: StorageEvent) => {
        if (event.key === browserFallbackStateStorageKey) {
          listener(syncBrowserFallbackStateFromStorage().state)
        }
      }
      window.addEventListener('storage', onStorage)
      return () => {
        browserFallbackStateListeners.delete(listener)
        window.removeEventListener('storage', onStorage)
      }
    },
    onStatusChanged: (listener) => {
      browserFallbackStatusListeners.add(listener)
      const onStorage = (event: StorageEvent) => {
        if (event.key === browserFallbackStateStorageKey) {
          listener(syncBrowserFallbackStateFromStorage())
        }
      }
      window.addEventListener('storage', onStorage)
      return () => {
        browserFallbackStatusListeners.delete(listener)
        window.removeEventListener('storage', onStorage)
      }
    },
  },
}

export const desktopApi = window.arcaneTabletop ?? browserFallbackApi

function createCampaignSummary(campaign: Campaign): CampaignSummary {
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    updatedAt: campaign.updatedAt,
    sceneCount: campaign.scenes.length,
    assetCount: campaign.assets.length,
    characterCount: campaign.characterCards.length,
  }
}

function createBrowserFallbackAsset(request: ImportImageAssetRequest): Asset {
  browserFallbackAssetCounter += 1
  const name = request.suggestedName?.trim() || 'Демо-изображение'

  return {
    id: `asset-browser-${browserFallbackAssetCounter}`,
    campaignId: request.campaignId,
    kind: request.kind,
    name,
    filePath: createBrowserFallbackImageDataUrl(name),
    tags: request.tags ?? [],
    createdAt: new Date().toISOString(),
    metadata: {
      browserFallback: true,
      originalFileName: `${name}.png`,
    },
  }
}

function createBrowserFallbackImageDataUrl(name: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="#2e3536"/><path d="M0 380 L180 240 L310 310 L500 160 L960 420 L960 540 L0 540 Z" fill="#49625f"/><path d="M0 430 L210 310 L370 380 L560 230 L960 470 L960 540 L0 540 Z" fill="#789078"/><circle cx="760" cy="130" r="54" fill="#d7b56d"/><text x="60" y="92" fill="#f5efe3" font-family="Arial, sans-serif" font-size="42" font-weight="700">${escapeSvgText(name)}</text><text x="60" y="140" fill="#d8d0c3" font-family="Arial, sans-serif" font-size="24">Browser fallback asset</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeSvgText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function updateBrowserFallbackState(state: PlayerScreenState): PlayerScreenCommandResult {
  browserFallbackState = cloneBrowserFallbackState({
    ...state,
    updatedAt: new Date().toISOString(),
  })
  writeStoredBrowserFallbackState(browserFallbackState)
  browserFallbackStatus.state = browserFallbackState

  for (const listener of browserFallbackStateListeners) {
    listener(browserFallbackState)
  }

  for (const listener of browserFallbackStatusListeners) {
    listener(browserFallbackStatus)
  }

  return createBrowserFallbackResult(true, undefined)
}

function syncBrowserFallbackStateFromStorage(): PlayerScreenStatus {
  const storedState = readStoredBrowserFallbackState()

  if (storedState) {
    browserFallbackState = storedState
    browserFallbackStatus.state = browserFallbackState
  }

  return browserFallbackStatus
}

function readStoredBrowserFallbackState(): PlayerScreenState | null {
  try {
    const serializedState = window.localStorage.getItem(browserFallbackStateStorageKey)

    if (!serializedState) {
      return null
    }

    return cloneBrowserFallbackState(JSON.parse(serializedState) as PlayerScreenState)
  } catch {
    return null
  }
}

function writeStoredBrowserFallbackState(state: PlayerScreenState): void {
  try {
    window.localStorage.setItem(browserFallbackStateStorageKey, JSON.stringify(state))
  } catch {
    // Browser fallback verification can continue with in-memory state.
  }
}

function cloneBrowserFallbackState(state: PlayerScreenState): PlayerScreenState {
  return {
    ...state,
    visibleTokenIds: [...state.visibleTokenIds],
    revealedAssetIds: [...state.revealedAssetIds],
    sceneCanvas: state.sceneCanvas
        ? {
          ...state.sceneCanvas,
          grid: { ...state.sceneCanvas.grid },
          viewport: { ...state.sceneCanvas.viewport },
          backgroundAsset: state.sceneCanvas.backgroundAsset ? { ...state.sceneCanvas.backgroundAsset } : undefined,
          layers: state.sceneCanvas.layers.map((layer) => ({ ...layer })),
          objects: state.sceneCanvas.objects.map((object) => ({ ...object })),
          measurements: state.sceneCanvas.measurements.map((measurement) => ({ ...measurement })),
        }
      : undefined,
  }
}
