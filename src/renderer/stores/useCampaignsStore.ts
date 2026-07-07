import { useCallback, useEffect, useState } from 'react'
import { desktopApi } from '@renderer/services/desktopApi'
import type {
  AssetId,
  Campaign,
  CampaignId,
  CampaignSummary,
  ImageAssetKind,
  PlayerScreenCommandResult,
  SceneCanvasViewport,
  SceneGrid,
  SceneId,
} from '@shared/types'
import {
  createCampaignWithAssetInActiveScene,
  createCampaignWithAssetPreview,
  createCampaignWithAssetTags,
  createCampaignWithImportedAsset,
} from './assetFactory'
import { createEmptyCampaign, createUpdatedCampaignMetadata } from './campaignFactory'
import {
  createCampaignWithActiveScene,
  createCampaignWithHydratedScenes,
  createCampaignWithNewScene,
  createCampaignWithScenePreview,
  getActiveCampaignScene,
} from './sceneFactory'
import {
  createCampaignWithActiveSceneGrid,
  createCampaignWithActiveSceneMeasurement,
  createCampaignWithActiveSceneViewport,
  createCampaignWithoutActiveSceneMeasurements,
  type SceneMeasurementTemplate,
} from './sceneToolsFactory'

export type CampaignsStoreStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'deleting' | 'error'
export type CampaignMutationResult = { ok: true; campaign: Campaign } | { ok: false; reason: string }
export type AssetMutationResult =
  | { ok: true; campaign: Campaign; assetId: AssetId }
  | { ok: false; reason: string }
export type PlayerScenePreviewResult =
  | { ok: true; campaign: Campaign; playerStatus: PlayerScreenCommandResult }
  | { ok: false; reason: string }

export function useCampaignsStore() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [status, setStatus] = useState<CampaignsStoreStatus>('idle')
  const [lastError, setLastError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setStatus('loading')
    setLastError(null)

    try {
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
    } catch {
      setLastError('Не удалось прочитать список кампаний.')
      setStatus('error')
    }
  }, [])

  const createCampaign = useCallback(
    async (name: string, description?: string): Promise<CampaignMutationResult> => {
      setStatus('saving')
      setLastError(null)

      try {
        const campaign = createEmptyCampaign({ name, description })
        await desktopApi.storage.saveCampaign(campaign)
        setSelectedCampaign(campaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign }
      } catch {
        setLastError('Не удалось создать кампанию.')
        setStatus('error')
        return { ok: false, reason: 'create-failed' }
      }
    },
    [],
  )

  const openCampaign = useCallback(async (campaignId: CampaignId): Promise<CampaignMutationResult> => {
    setStatus('loading')
    setLastError(null)

    try {
      const campaign = await desktopApi.storage.loadCampaign(campaignId)

      if (campaign === null) {
        setLastError('Кампания не найдена.')
        setStatus('error')
        return { ok: false, reason: 'campaign-not-found' }
      }

      const hydratedCampaign = createCampaignWithHydratedScenes(campaign)
      setSelectedCampaign(hydratedCampaign)
      setStatus('ready')
      return { ok: true, campaign: hydratedCampaign }
    } catch {
      setLastError('Не удалось открыть кампанию.')
      setStatus('error')
      return { ok: false, reason: 'open-failed' }
    }
  }, [])

  const saveSelectedCampaign = useCallback(
    async (name: string, description?: string): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для сохранения.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createUpdatedCampaignMetadata(selectedCampaign, name, description)
        await desktopApi.storage.saveCampaign(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось сохранить кампанию.')
        setStatus('error')
        return { ok: false, reason: 'save-failed' }
      }
    },
    [selectedCampaign],
  )

  const deleteSelectedCampaign = useCallback(async (): Promise<boolean> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для удаления.')
      return false
    }

    setStatus('deleting')
    setLastError(null)

    try {
      await desktopApi.storage.deleteCampaign(selectedCampaign.id)
      setSelectedCampaign(null)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return true
    } catch {
      setLastError('Не удалось удалить кампанию.')
      setStatus('error')
      return false
    }
  }, [selectedCampaign])

  const createScene = useCallback(
    async (name: string, description?: string): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для создания сцены.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithNewScene(selectedCampaign, { name, description })
        await desktopApi.storage.saveCampaign(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось создать сцену.')
        setStatus('error')
        return { ok: false, reason: 'create-scene-failed' }
      }
    },
    [selectedCampaign],
  )

  const activateScene = useCallback(
    async (sceneId: SceneId): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для выбора сцены.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithActiveScene(selectedCampaign, sceneId)
        await desktopApi.storage.saveCampaign(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось выбрать активную сцену.')
        setStatus('error')
        return { ok: false, reason: 'activate-scene-failed' }
      }
    },
    [selectedCampaign],
  )

  const sendActiveSceneToPlayers = useCallback(async (): Promise<PlayerScenePreviewResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для показа сцены.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    const activeScene = getActiveCampaignScene(selectedCampaign)

    if (activeScene === null) {
      setLastError('В кампании нет сцены для показа игрокам.')
      return { ok: false, reason: 'scene-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = createCampaignWithScenePreview(selectedCampaign, activeScene.id)
      await desktopApi.storage.saveCampaign(updatedCampaign)
      const playerStatus = await desktopApi.playerScreen.updateState(updatedCampaign.playerScreenState)

      if (!playerStatus.ok) {
        setLastError('Не удалось отправить сцену игрокам.')
        setStatus('error')
        return { ok: false, reason: playerStatus.reason ?? 'player-screen-update-failed' }
      }

      setSelectedCampaign(updatedCampaign)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return { ok: true, campaign: updatedCampaign, playerStatus }
    } catch {
      setLastError('Не удалось отправить сцену игрокам.')
      setStatus('error')
      return { ok: false, reason: 'send-scene-failed' }
    }
  }, [selectedCampaign])

  const updateActiveSceneGrid = useCallback(
    async (grid: Partial<SceneGrid>): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для настройки сетки.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithActiveSceneGrid(selectedCampaign, grid)
        await desktopApi.storage.saveCampaign(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось сохранить настройки сетки.')
        setStatus('error')
        return { ok: false, reason: 'update-grid-failed' }
      }
    },
    [selectedCampaign],
  )

  const updateActiveSceneViewport = useCallback(
    async (viewport: Partial<SceneCanvasViewport>): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для настройки canvas.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithActiveSceneViewport(selectedCampaign, viewport)
        await desktopApi.storage.saveCampaign(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось сохранить положение canvas.')
        setStatus('error')
        return { ok: false, reason: 'update-viewport-failed' }
      }
    },
    [selectedCampaign],
  )

  const addActiveSceneMeasurement = useCallback(
    async (template: SceneMeasurementTemplate): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для измерений.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithActiveSceneMeasurement(selectedCampaign, template)
        await desktopApi.storage.saveCampaign(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось добавить измерение.')
        setStatus('error')
        return { ok: false, reason: 'add-measurement-failed' }
      }
    },
    [selectedCampaign],
  )

  const clearActiveSceneMeasurements = useCallback(async (): Promise<CampaignMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для очистки измерений.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = createCampaignWithoutActiveSceneMeasurements(selectedCampaign)
      await desktopApi.storage.saveCampaign(updatedCampaign)
      setSelectedCampaign(updatedCampaign)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return { ok: true, campaign: updatedCampaign }
    } catch {
      setLastError('Не удалось очистить измерения.')
      setStatus('error')
      return { ok: false, reason: 'clear-measurements-failed' }
    }
  }, [selectedCampaign])

  const importImageAsset = useCallback(
    async (kind: ImageAssetKind, suggestedName?: string, tags?: string[]): Promise<AssetMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для импорта изображения.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const result = await desktopApi.assets.importImageAsset({
          campaignId: selectedCampaign.id,
          kind,
          suggestedName,
          tags,
        })

        if (!result.ok) {
          setStatus('ready')

          if (result.reason !== 'cancelled') {
            setLastError('Не удалось импортировать изображение.')
          }

          return { ok: false, reason: result.reason }
        }

        const updatedCampaign = createCampaignWithImportedAsset(selectedCampaign, result.asset)
        await desktopApi.storage.saveCampaign(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, assetId: result.asset.id }
      } catch {
        setLastError('Не удалось импортировать изображение.')
        setStatus('error')
        return { ok: false, reason: 'import-image-failed' }
      }
    },
    [selectedCampaign],
  )

  const updateAssetTags = useCallback(
    async (assetId: AssetId, tags: string): Promise<AssetMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для редактирования ассета.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithAssetTags(selectedCampaign, assetId, tags)
        await desktopApi.storage.saveCampaign(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, assetId }
      } catch {
        setLastError('Не удалось сохранить теги ассета.')
        setStatus('error')
        return { ok: false, reason: 'update-asset-tags-failed' }
      }
    },
    [selectedCampaign],
  )

  const applyAssetToActiveScene = useCallback(
    async (assetId: AssetId): Promise<AssetMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для использования ассета.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithAssetInActiveScene(selectedCampaign, assetId)
        await desktopApi.storage.saveCampaign(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, assetId }
      } catch {
        setLastError('Не удалось добавить ассет в активную сцену.')
        setStatus('error')
        return { ok: false, reason: 'use-asset-failed' }
      }
    },
    [selectedCampaign],
  )

  const sendAssetToPlayers = useCallback(
    async (assetId: AssetId): Promise<PlayerScenePreviewResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для показа изображения.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithAssetPreview(selectedCampaign, assetId)
        await desktopApi.storage.saveCampaign(updatedCampaign)
        const playerStatus = await desktopApi.playerScreen.updateState(updatedCampaign.playerScreenState)

        if (!playerStatus.ok) {
          setLastError('Не удалось отправить изображение игрокам.')
          setStatus('error')
          return { ok: false, reason: playerStatus.reason ?? 'player-screen-update-failed' }
        }

        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, playerStatus }
      } catch {
        setLastError('Не удалось отправить изображение игрокам.')
        setStatus('error')
        return { ok: false, reason: 'send-asset-failed' }
      }
    },
    [selectedCampaign],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    campaigns,
    selectedCampaign,
    status,
    lastError,
    refresh,
    createCampaign,
    openCampaign,
    saveSelectedCampaign,
    deleteSelectedCampaign,
    createScene,
    activateScene,
    sendActiveSceneToPlayers,
    updateActiveSceneGrid,
    updateActiveSceneViewport,
    addActiveSceneMeasurement,
    clearActiveSceneMeasurements,
    importImageAsset,
    updateAssetTags,
    applyAssetToActiveScene,
    sendAssetToPlayers,
  }
}
