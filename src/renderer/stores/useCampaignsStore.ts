import { useCallback, useEffect, useRef, useState } from 'react'
import { desktopApi } from '@renderer/services/desktopApi'
import type {
  AssetId,
  AssetLibraryItem,
  Campaign,
  CampaignAssetExportPolicy,
  CampaignId,
  CampaignSummary,
  CampaignsDirectoryInfo,
  CharacterCardId,
  CombatParticipantId,
  ImageAssetKind,
  NoteId,
  PlayerScreenCommandResult,
  ProjectExportResult,
  ProjectExportPreviewResult,
  ProjectImportResult,
  ProjectTransferFailureReason,
  SceneCanvasFogRegionId,
  SceneCanvasFogState,
  SceneCanvasObjectId,
  SceneCanvasObjectTokenState,
  SceneCanvasViewport,
  SceneGrid,
  SceneId,
} from '@shared/types'
import {
  createCampaignWithAssetInActiveScene,
  createCampaignWithAssetPreview,
  createCampaignWithAssetTags,
  createCampaignWithImportedAsset,
  createCampaignWithIndexedAsset,
} from './assetFactory'
import {
  createCampaignWithHydratedPlayerScreenState,
  createEmptyCampaign,
  createUpdatedCampaignMetadata,
} from './campaignFactory'
import {
  createCampaignWithHydratedCharacterCards,
  createCampaignWithNewCharacterCard,
  createCampaignWithUpdatedCharacterCard,
  createCampaignWithoutCharacterCard,
  type CharacterCardInput,
} from './characterCardFactory'
import {
  createCampaignWithCombatStarted,
  createCampaignWithCombatStopped,
  createCampaignWithHydratedCombatState,
  createCampaignWithNewCombatParticipant,
  createCampaignWithNextCombatRound,
  createCampaignWithNextCombatTurn,
  createCampaignWithPlayerInitiativeVisibility,
  createCampaignWithUpdatedCombatParticipant,
  createCampaignWithoutCombatParticipant,
  type CombatParticipantInput,
} from './combatFactory'
import {
  createCampaignWithHiddenPlayerHandout,
  createCampaignWithHydratedNotes,
  createCampaignWithNewNote,
  createCampaignWithNoteHandout,
  createCampaignWithUpdatedNote,
  createCampaignWithoutNote,
  type NoteInput,
} from './noteFactory'
import {
  createCampaignWithActiveScene,
  createCampaignWithClearedPlayerScreen,
  createCampaignWithHydratedScenes,
  createCampaignWithNewScene,
  createCampaignWithPublishedSceneProjection,
  createCampaignWithScenePreview,
  getActiveCampaignScene,
} from './sceneFactory'
import {
  createCampaignWithActiveSceneGrid,
  createCampaignWithActiveSceneFog,
  createCampaignWithActiveSceneFogRegion,
  createCampaignWithActiveSceneMeasurement,
  createCampaignWithActiveSceneObjectTokenState,
  createCampaignWithActiveSceneObjectVisibility,
  createCampaignWithActiveSceneViewport,
  createCampaignWithPlayerSceneViewport,
  createCampaignWithDuplicatedActiveSceneObject,
  createCampaignWithMovedActiveSceneObject,
  createCampaignWithPositionedActiveSceneObject,
  createCampaignWithUpdatedActiveSceneFogRegion,
  createCampaignWithoutActiveSceneFogRegions,
  createCampaignWithoutActiveSceneMeasurements,
  createCampaignWithoutLastActiveSceneFogRegion,
  type SceneCanvasObjectPosition,
  type SceneFogRegionInput,
  type SceneFogRegionUpdate,
  type SceneMeasurementInput,
  type SceneObjectMoveDirection,
} from './sceneToolsFactory'
import type { SceneUserLayerId } from './sceneCanvasFactory'

export type CampaignsStoreStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'deleting' | 'error'
export type CampaignMutationResult = { ok: true; campaign: Campaign } | { ok: false; reason: string }
export type CampaignDirectoryMutationResult =
  | {
      ok: true
      canceled: boolean
      directory: CampaignsDirectoryInfo
      campaigns: CampaignSummary[]
    }
  | { ok: false; reason: string }
export type CampaignSaveToDirectoryResult =
  | { ok: true; campaign: Campaign; directory: CampaignsDirectoryInfo }
  | { ok: false; reason: string }
export type AssetMutationResult =
  | { ok: true; campaign: Campaign; assetId: AssetId }
  | { ok: false; reason: string }
export type CharacterCardMutationResult =
  | { ok: true; campaign: Campaign; characterCardId: CharacterCardId }
  | { ok: false; reason: string }
export type NoteMutationResult =
  | { ok: true; campaign: Campaign; noteId: NoteId }
  | { ok: false; reason: string }
export type CombatMutationResult =
  | {
      ok: true
      campaign: Campaign
      participantId?: CombatParticipantId
      playerStatus?: PlayerScreenCommandResult
    }
  | { ok: false; reason: string }
export type PlayerScenePreviewResult =
  | { ok: true; campaign: Campaign; playerStatus: PlayerScreenCommandResult }
  | { ok: false; reason: string }
export type PlayerHandoutPreviewResult =
  | { ok: true; campaign: Campaign; playerStatus: PlayerScreenCommandResult }
  | { ok: false; reason: string }
export type CampaignSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
export interface CampaignSaveState {
  status: CampaignSaveStatus
  isDirty: boolean
  lastSavedAt: string | null
  lastError: string | null
  autosaveDelayMs: number
}
export interface CampaignHistoryState {
  undoCount: number
  redoCount: number
}

const AUTOSAVE_DELAY_MS = 3500
const CAMPAIGN_HISTORY_LIMIT = 30

export function useCampaignsStore() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([])
  const [campaignsDirectory, setCampaignsDirectory] = useState<CampaignsDirectoryInfo | null>(null)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [status, setStatus] = useState<CampaignsStoreStatus>('idle')
  const [lastError, setLastError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<CampaignSaveState>(() => createInitialSaveState())
  const [historyState, setHistoryState] = useState<CampaignHistoryState>(() => createInitialHistoryState())
  const autosaveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const previousSelectedCampaignRef = useRef<Campaign | null>(null)
  const selectedCampaignRef = useRef<Campaign | null>(null)
  const undoStackRef = useRef<Campaign[]>([])
  const redoStackRef = useRef<Campaign[]>([])
  const skipNextHistoryRef = useRef(false)

  const updateHistoryState = useCallback(() => {
    setHistoryState({
      undoCount: undoStackRef.current.length,
      redoCount: redoStackRef.current.length,
    })
  }, [])

  const clearHistory = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    updateHistoryState()
  }, [updateHistoryState])

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }, [])

  const saveCampaignWithStatus = useCallback(async (campaign: Campaign): Promise<void> => {
    setSaveState((current) => ({
      ...current,
      status: 'saving',
      isDirty: true,
      lastError: null,
    }))

    try {
      await desktopApi.storage.saveCampaign(campaign)
      setSaveState({
        status: 'saved',
        isDirty: false,
        lastSavedAt: new Date().toISOString(),
        lastError: null,
        autosaveDelayMs: AUTOSAVE_DELAY_MS,
      })
    } catch (error) {
      const message = 'Не удалось сохранить изменения кампании.'
      setLastError(message)
      setSaveState((current) => ({
        ...current,
        status: 'error',
        isDirty: true,
        lastError: message,
      }))
      throw error
    }
  }, [])

  const saveCampaignWithLivePlayerProjection = useCallback(
    async (campaign: Campaign): Promise<Campaign> => {
      const campaignWithProjection = createCampaignWithPublishedSceneProjection(campaign)
      await saveCampaignWithStatus(campaignWithProjection)

      if (campaignWithProjection !== campaign) {
        const playerStatus = await desktopApi.playerScreen.updateState(campaignWithProjection.playerScreenState)

        if (!playerStatus.ok) {
          throw new Error(playerStatus.reason ?? 'player-screen-update-failed')
        }
      }

      return campaignWithProjection
    },
    [saveCampaignWithStatus],
  )

  const queueAutosave = useCallback(
    (campaign: Campaign) => {
      clearAutosaveTimer()
      setSaveState((current) => ({
        ...current,
        status: 'dirty',
        isDirty: true,
        lastError: null,
      }))

      autosaveTimerRef.current = window.setTimeout(() => {
        autosaveTimerRef.current = null

        const currentCampaign = selectedCampaignRef.current

        if (currentCampaign === null || currentCampaign.id !== campaign.id) {
          return
        }

        void saveCampaignWithStatus(currentCampaign)
      }, AUTOSAVE_DELAY_MS)
    },
    [clearAutosaveTimer, saveCampaignWithStatus],
  )

  const undoSelectedCampaign = useCallback(async (): Promise<CampaignMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для отмены действия.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    const snapshot = undoStackRef.current.pop()

    if (!snapshot) {
      return { ok: false, reason: 'undo-history-empty' }
    }

    const currentSnapshot = cloneCampaignSnapshot(selectedCampaign)
    redoStackRef.current = limitCampaignHistory([...redoStackRef.current, currentSnapshot])
    skipNextHistoryRef.current = true
    clearAutosaveTimer()
    setStatus('saving')
    setLastError(null)

    try {
      await saveCampaignWithStatus(snapshot)
      await desktopApi.playerScreen.updateState(snapshot.playerScreenState)
      setSelectedCampaign(snapshot)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      updateHistoryState()
      return { ok: true, campaign: snapshot }
    } catch {
      undoStackRef.current = limitCampaignHistory([...undoStackRef.current, snapshot])
      redoStackRef.current = redoStackRef.current.filter((campaign) => campaign !== currentSnapshot)
      skipNextHistoryRef.current = false
      updateHistoryState()
      setLastError('Не удалось отменить последнее действие.')
      setStatus('error')
      return { ok: false, reason: 'undo-failed' }
    }
  }, [clearAutosaveTimer, saveCampaignWithStatus, selectedCampaign, updateHistoryState])

  const redoSelectedCampaign = useCallback(async (): Promise<CampaignMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для повтора действия.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    const snapshot = redoStackRef.current.pop()

    if (!snapshot) {
      return { ok: false, reason: 'redo-history-empty' }
    }

    const currentSnapshot = cloneCampaignSnapshot(selectedCampaign)
    undoStackRef.current = limitCampaignHistory([...undoStackRef.current, currentSnapshot])
    skipNextHistoryRef.current = true
    clearAutosaveTimer()
    setStatus('saving')
    setLastError(null)

    try {
      await saveCampaignWithStatus(snapshot)
      await desktopApi.playerScreen.updateState(snapshot.playerScreenState)
      setSelectedCampaign(snapshot)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      updateHistoryState()
      return { ok: true, campaign: snapshot }
    } catch {
      redoStackRef.current = limitCampaignHistory([...redoStackRef.current, snapshot])
      undoStackRef.current = undoStackRef.current.filter((campaign) => campaign !== currentSnapshot)
      skipNextHistoryRef.current = false
      updateHistoryState()
      setLastError('Не удалось повторить действие.')
      setStatus('error')
      return { ok: false, reason: 'redo-failed' }
    }
  }, [clearAutosaveTimer, saveCampaignWithStatus, selectedCampaign, updateHistoryState])

  useEffect(() => {
    const previousCampaign = previousSelectedCampaignRef.current
    selectedCampaignRef.current = selectedCampaign

    if (selectedCampaign === null) {
      previousSelectedCampaignRef.current = null
      clearHistory()
      clearAutosaveTimer()
      setSaveState(createInitialSaveState())
      return
    }

    const nextSnapshot = cloneCampaignSnapshot(selectedCampaign)

    if (previousCampaign === null || previousCampaign.id !== selectedCampaign.id) {
      previousSelectedCampaignRef.current = nextSnapshot
      clearHistory()
      clearAutosaveTimer()
      setSaveState({
        status: 'saved',
        isDirty: false,
        lastSavedAt: selectedCampaign.updatedAt,
        lastError: null,
        autosaveDelayMs: AUTOSAVE_DELAY_MS,
      })
      return
    }

    if (areCampaignSnapshotsEqual(previousCampaign, selectedCampaign)) {
      previousSelectedCampaignRef.current = nextSnapshot
      return
    }

    if (skipNextHistoryRef.current) {
      skipNextHistoryRef.current = false
      previousSelectedCampaignRef.current = nextSnapshot
      return
    }

    undoStackRef.current = limitCampaignHistory([...undoStackRef.current, previousCampaign])
    redoStackRef.current = []
    previousSelectedCampaignRef.current = nextSnapshot
    updateHistoryState()
    queueAutosave(selectedCampaign)
  }, [clearAutosaveTimer, clearHistory, queueAutosave, selectedCampaign, updateHistoryState])

  useEffect(() => {
    const flushBeforeUnload = () => {
      clearAutosaveTimer()

      const currentCampaign = selectedCampaignRef.current

      if (currentCampaign !== null) {
        void desktopApi.storage.saveCampaign(currentCampaign)
      }
    }

    window.addEventListener('beforeunload', flushBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', flushBeforeUnload)
      flushBeforeUnload()
    }
  }, [clearAutosaveTimer])

  const refresh = useCallback(async () => {
    setStatus('loading')
    setLastError(null)

    try {
      const [directory, campaignSummaries] = await Promise.all([
        desktopApi.storage.getCampaignsDirectory(),
        desktopApi.storage.listCampaigns(),
      ])
      setCampaignsDirectory(directory)
      setCampaigns(campaignSummaries)
      setStatus('ready')
    } catch {
      setLastError('Не удалось прочитать список кампаний.')
      setStatus('error')
    }
  }, [])

  const selectCampaignsDirectory = useCallback(async (): Promise<CampaignDirectoryMutationResult> => {
    setStatus('loading')
    setLastError(null)
    clearAutosaveTimer()

    try {
      const currentCampaign = selectedCampaignRef.current

      if (currentCampaign !== null && saveState.isDirty) {
        await saveCampaignWithStatus(currentCampaign)
      }

      const result = await desktopApi.storage.selectCampaignsDirectory()
      setCampaignsDirectory(result.directory)
      setCampaigns(result.campaigns)

      if (!result.canceled) {
        setSelectedCampaign(null)
        selectedCampaignRef.current = null
        previousSelectedCampaignRef.current = null
        clearHistory()
        setSaveState(createInitialSaveState())
      }

      setStatus('ready')
      return { ok: true, ...result }
    } catch {
      setLastError('Не удалось открыть папку проекта.')
      setStatus('error')
      return { ok: false, reason: 'select-directory-failed' }
    }
  }, [clearAutosaveTimer, clearHistory, saveCampaignWithStatus, saveState.isDirty])

  const saveSelectedCampaignToDirectory = useCallback(
    async (name: string, description?: string): Promise<CampaignSaveToDirectoryResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для сохранения.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)
      clearAutosaveTimer()

      try {
        const updatedCampaign = createUpdatedCampaignMetadata(selectedCampaign, name, description)
        const result = await desktopApi.storage.saveCampaignToDirectory(updatedCampaign)
        setCampaignsDirectory(result.directory)
        setCampaigns(result.campaigns)

        if (result.canceled) {
          setStatus('ready')
          return { ok: false, reason: 'directory-selection-canceled' }
        }

        setSelectedCampaign(updatedCampaign)
        setSaveState({
          status: 'saved',
          isDirty: false,
          lastSavedAt: new Date().toISOString(),
          lastError: null,
          autosaveDelayMs: AUTOSAVE_DELAY_MS,
        })
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, directory: result.directory }
      } catch {
        setLastError('Не удалось сохранить кампанию в выбранную папку.')
        setStatus('error')
        return { ok: false, reason: 'save-to-directory-failed' }
      }
    },
    [clearAutosaveTimer, selectedCampaign],
  )

  const createCampaign = useCallback(
    async (name: string, description?: string): Promise<CampaignMutationResult> => {
      setStatus('saving')
      setLastError(null)

      try {
        const campaign = createEmptyCampaign({ name, description })
        await saveCampaignWithStatus(campaign)
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
    [saveCampaignWithStatus],
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

      const hydratedCampaign = createCampaignWithHydratedCombatState(
        createCampaignWithHydratedNotes(
          createCampaignWithHydratedCharacterCards(
            createCampaignWithHydratedScenes(createCampaignWithHydratedPlayerScreenState(campaign)),
          ),
        ),
      )
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
        await saveCampaignWithStatus(updatedCampaign)
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
    [saveCampaignWithStatus, selectedCampaign],
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

  const importProject = useCallback(async (): Promise<ProjectImportResult> => {
    setStatus('loading')
    setLastError(null)

    try {
      const result = await desktopApi.storage.importProject()

      if (!result.ok) {
        if (result.reason === 'cancelled') {
          setStatus('ready')
          return result
        }

        setLastError(
          result.damagedBlobCount
            ? `Пакет повреждён: файлов с неверным размером или SHA-256 — ${result.damagedBlobCount}. Импорт не выполнялся.`
            : getProjectTransferErrorMessage(result.reason, 'import'),
        )
        setStatus('error')
        return result
      }

      const hydratedCampaign = createCampaignWithHydratedCombatState(
        createCampaignWithHydratedNotes(
          createCampaignWithHydratedCharacterCards(
            createCampaignWithHydratedScenes(createCampaignWithHydratedPlayerScreenState(result.campaign)),
          ),
        ),
      )
      setSelectedCampaign(hydratedCampaign)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return { ...result, campaign: hydratedCampaign }
    } catch {
      setLastError('Не удалось импортировать проект.')
      setStatus('error')
      return { ok: false, reason: 'read-failed' }
    }
  }, [])

  const previewSelectedProjectExport = useCallback(async (): Promise<ProjectExportPreviewResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет выбранного проекта для экспорта.')
      return { ok: false, reason: 'campaign-not-found' }
    }

    setStatus('saving')
    setLastError(null)
    clearAutosaveTimer()

    try {
      await saveCampaignWithStatus(selectedCampaign)
      const result = await desktopApi.storage.previewProjectExport(selectedCampaign.id)

      if (!result.ok) {
        setLastError(getProjectTransferErrorMessage(result.reason, 'export'))
        setStatus('error')
        return result
      }

      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return result
    } catch {
      setLastError('Не удалось подготовить состав экспортного пакета.')
      setStatus('error')
      return { ok: false, reason: 'asset-read-failed' }
    }
  }, [clearAutosaveTimer, saveCampaignWithStatus, selectedCampaign])

  const exportSelectedProject = useCallback(async (previewToken: string): Promise<ProjectExportResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет выбранного проекта для экспорта.')
      return { ok: false, reason: 'campaign-not-found' }
    }

    setStatus('saving')
    setLastError(null)
    clearAutosaveTimer()

    try {
      const result = await desktopApi.storage.exportProject(selectedCampaign.id, previewToken)
      if (!result.ok) {
        if (result.reason === 'cancelled') {
          setStatus('ready')
          return result
        }
        setLastError(getProjectTransferErrorMessage(result.reason, 'export'))
        setStatus('error')
        return result
      }
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return result
    } catch {
      setLastError('Не удалось экспортировать проект.')
      setStatus('error')
      return { ok: false, reason: 'write-failed' }
    }
  }, [clearAutosaveTimer, selectedCampaign])

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
        await saveCampaignWithStatus(updatedCampaign)
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
    [saveCampaignWithStatus, selectedCampaign],
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
        await saveCampaignWithStatus(updatedCampaign)
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
    [saveCampaignWithStatus, selectedCampaign],
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
      await saveCampaignWithStatus(updatedCampaign)
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
  }, [saveCampaignWithStatus, selectedCampaign])

  const clearPlayerScreen = useCallback(async (): Promise<PlayerScenePreviewResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для очистки экрана игроков.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = createCampaignWithClearedPlayerScreen(selectedCampaign)
      await saveCampaignWithStatus(updatedCampaign)
      const playerStatus = await desktopApi.playerScreen.updateState(updatedCampaign.playerScreenState)

      if (!playerStatus.ok) {
        setLastError('Не удалось очистить экран игроков.')
        setStatus('error')
        return { ok: false, reason: playerStatus.reason ?? 'player-screen-update-failed' }
      }

      setSelectedCampaign(updatedCampaign)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return { ok: true, campaign: updatedCampaign, playerStatus }
    } catch {
      setLastError('Не удалось очистить экран игроков.')
      setStatus('error')
      return { ok: false, reason: 'clear-player-screen-failed' }
    }
  }, [saveCampaignWithStatus, selectedCampaign])

  const updateActiveSceneGrid = useCallback(
    async (grid: Partial<SceneGrid>): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для настройки сетки.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithActiveSceneGrid(selectedCampaign, grid),
        )
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
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
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
        await saveCampaignWithStatus(updatedCampaign)
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
    [saveCampaignWithStatus, selectedCampaign],
  )

  const updatePlayerSceneViewport = useCallback(
    async (viewport: Partial<SceneCanvasViewport>): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для настройки экрана игроков.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithPlayerSceneViewport(selectedCampaign, viewport)
        await saveCampaignWithStatus(updatedCampaign)
        await desktopApi.playerScreen.updateState(updatedCampaign.playerScreenState)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось сохранить вид экрана игроков.')
        setStatus('error')
        return { ok: false, reason: 'update-player-viewport-failed' }
      }
    },
    [saveCampaignWithStatus, selectedCampaign],
  )

  const addActiveSceneMeasurement = useCallback(
    async (input: SceneMeasurementInput): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для измерений.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithActiveSceneMeasurement(selectedCampaign, input),
        )
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
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
  )

  const clearActiveSceneMeasurements = useCallback(async (): Promise<CampaignMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для очистки измерений.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = await saveCampaignWithLivePlayerProjection(
        createCampaignWithoutActiveSceneMeasurements(selectedCampaign),
      )
      setSelectedCampaign(updatedCampaign)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return { ok: true, campaign: updatedCampaign }
    } catch {
      setLastError('Не удалось очистить измерения.')
      setStatus('error')
      return { ok: false, reason: 'clear-measurements-failed' }
    }
  }, [saveCampaignWithLivePlayerProjection, selectedCampaign])

  const updateActiveSceneFog = useCallback(
    async (fog: Partial<Pick<SceneCanvasFogState, 'enabled' | 'opacity'>>): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для настройки тумана войны.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithActiveSceneFog(selectedCampaign, fog),
        )
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось сохранить туман войны.')
        setStatus('error')
        return { ok: false, reason: 'update-fog-failed' }
      }
    },
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
  )

  const addActiveSceneFogRegion = useCallback(
    async (input: SceneFogRegionInput): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для добавления тумана войны.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithActiveSceneFogRegion(selectedCampaign, input),
        )
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось добавить область тумана.')
        setStatus('error')
        return { ok: false, reason: 'add-fog-region-failed' }
      }
    },
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
  )

  const updateActiveSceneFogRegion = useCallback(
    async (
      regionId: SceneCanvasFogRegionId,
      regionUpdate: SceneFogRegionUpdate,
    ): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для изменения области тумана войны.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithUpdatedActiveSceneFogRegion(selectedCampaign, regionId, regionUpdate),
        )
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось изменить область тумана войны.')
        setStatus('error')
        return { ok: false, reason: 'update-fog-region-failed' }
      }
    },
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
  )

  const removeLastActiveSceneFogRegion = useCallback(async (): Promise<CampaignMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для открытия области тумана.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = await saveCampaignWithLivePlayerProjection(
        createCampaignWithoutLastActiveSceneFogRegion(selectedCampaign),
      )
      setSelectedCampaign(updatedCampaign)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return { ok: true, campaign: updatedCampaign }
    } catch {
      setLastError('Не удалось открыть область тумана.')
      setStatus('error')
      return { ok: false, reason: 'remove-fog-region-failed' }
    }
  }, [saveCampaignWithLivePlayerProjection, selectedCampaign])

  const clearActiveSceneFogRegions = useCallback(async (): Promise<CampaignMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для очистки тумана войны.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = await saveCampaignWithLivePlayerProjection(
        createCampaignWithoutActiveSceneFogRegions(selectedCampaign),
      )
      setSelectedCampaign(updatedCampaign)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return { ok: true, campaign: updatedCampaign }
    } catch {
      setLastError('Не удалось очистить туман войны.')
      setStatus('error')
      return { ok: false, reason: 'clear-fog-failed' }
    }
  }, [saveCampaignWithLivePlayerProjection, selectedCampaign])

  const createCharacterCard = useCallback(
    async (input: CharacterCardInput): Promise<CharacterCardMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для создания карточки.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithNewCharacterCard(selectedCampaign, input)
        const characterCard = updatedCampaign.characterCards[updatedCampaign.characterCards.length - 1]

        await saveCampaignWithStatus(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, characterCardId: characterCard.id }
      } catch {
        setLastError('Не удалось создать карточку.')
        setStatus('error')
        return { ok: false, reason: 'create-character-card-failed' }
      }
    },
    [saveCampaignWithStatus, selectedCampaign],
  )

  const updateCharacterCard = useCallback(
    async (
      cardId: CharacterCardId,
      input: CharacterCardInput,
    ): Promise<CharacterCardMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для редактирования карточки.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithUpdatedCharacterCard(selectedCampaign, cardId, input)
        await saveCampaignWithStatus(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, characterCardId: cardId }
      } catch {
        setLastError('Не удалось обновить карточку.')
        setStatus('error')
        return { ok: false, reason: 'update-character-card-failed' }
      }
    },
    [saveCampaignWithStatus, selectedCampaign],
  )

  const deleteCharacterCard = useCallback(
    async (cardId: CharacterCardId): Promise<CharacterCardMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для удаления карточки.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithoutCharacterCard(selectedCampaign, cardId)
        await saveCampaignWithStatus(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, characterCardId: cardId }
      } catch {
        setLastError('Не удалось удалить карточку.')
        setStatus('error')
        return { ok: false, reason: 'delete-character-card-failed' }
      }
    },
    [saveCampaignWithStatus, selectedCampaign],
  )

  const createNote = useCallback(
    async (input: NoteInput): Promise<NoteMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для создания заметки.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithNewNote(selectedCampaign, input)
        const note = updatedCampaign.notes[0]

        await saveCampaignWithStatus(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, noteId: note.id }
      } catch {
        setLastError('Не удалось создать заметку.')
        setStatus('error')
        return { ok: false, reason: 'create-note-failed' }
      }
    },
    [saveCampaignWithStatus, selectedCampaign],
  )

  const updateNote = useCallback(
    async (noteId: NoteId, input: NoteInput): Promise<NoteMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для редактирования заметки.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithUpdatedNote(selectedCampaign, noteId, input)
        await saveCampaignWithStatus(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, noteId }
      } catch {
        setLastError('Не удалось сохранить заметку.')
        setStatus('error')
        return { ok: false, reason: 'update-note-failed' }
      }
    },
    [saveCampaignWithStatus, selectedCampaign],
  )

  const deleteNote = useCallback(
    async (noteId: NoteId): Promise<NoteMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для удаления заметки.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithoutNote(selectedCampaign, noteId)
        await saveCampaignWithStatus(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, noteId }
      } catch {
        setLastError('Не удалось удалить заметку.')
        setStatus('error')
        return { ok: false, reason: 'delete-note-failed' }
      }
    },
    [saveCampaignWithStatus, selectedCampaign],
  )

  const sendNoteToPlayers = useCallback(
    async (noteId: NoteId): Promise<PlayerHandoutPreviewResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для показа заметки.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithNoteHandout(selectedCampaign, noteId)
        await saveCampaignWithStatus(updatedCampaign)
        const playerStatus = await desktopApi.playerScreen.updateState(updatedCampaign.playerScreenState)

        if (!playerStatus.ok) {
          setLastError('Не удалось отправить handout игрокам.')
          setStatus('error')
          return { ok: false, reason: playerStatus.reason ?? 'player-screen-update-failed' }
        }

        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, playerStatus }
      } catch (error) {
        setLastError(error instanceof Error && error.message === 'note-is-secret'
          ? 'Секретная заметка не отправляется игрокам.'
          : 'Не удалось отправить handout игрокам.')
        setStatus('error')
        return { ok: false, reason: error instanceof Error ? error.message : 'send-note-failed' }
      }
    },
    [saveCampaignWithStatus, selectedCampaign],
  )

  const hidePlayerHandout = useCallback(async (): Promise<PlayerHandoutPreviewResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для скрытия handout.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = createCampaignWithHiddenPlayerHandout(selectedCampaign)
      await saveCampaignWithStatus(updatedCampaign)
      const playerStatus = await desktopApi.playerScreen.updateState(updatedCampaign.playerScreenState)

      if (!playerStatus.ok) {
        setLastError('Не удалось скрыть handout на экране игроков.')
        setStatus('error')
        return { ok: false, reason: playerStatus.reason ?? 'player-screen-update-failed' }
      }

      setSelectedCampaign(updatedCampaign)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return { ok: true, campaign: updatedCampaign, playerStatus }
    } catch {
      setLastError('Не удалось скрыть handout на экране игроков.')
      setStatus('error')
      return { ok: false, reason: 'hide-handout-failed' }
    }
  }, [saveCampaignWithStatus, selectedCampaign])

  const saveCombatCampaign = useCallback(
    async (
      updatedCampaign: Campaign,
      shouldSyncPlayerScreen: boolean,
    ): Promise<{ campaign: Campaign; playerStatus?: PlayerScreenCommandResult }> => {
      await saveCampaignWithStatus(updatedCampaign)
      const playerStatus = shouldSyncPlayerScreen
        ? await desktopApi.playerScreen.updateState(updatedCampaign.playerScreenState)
        : undefined

      if (playerStatus && !playerStatus.ok) {
        throw new Error(playerStatus.reason ?? 'player-screen-update-failed')
      }

      setSelectedCampaign(updatedCampaign)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return { campaign: updatedCampaign, playerStatus }
    },
    [saveCampaignWithStatus],
  )

  const createCombatParticipant = useCallback(
    async (input: CombatParticipantInput): Promise<CombatMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для добавления участника инициативы.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const existingIds = new Set(selectedCampaign.combatState.participants.map((participant) => participant.id))
        const updatedCampaign = createCampaignWithNewCombatParticipant(selectedCampaign, input)
        const participant = updatedCampaign.combatState.participants.find((candidate) => !existingIds.has(candidate.id))
        const saved = await saveCombatCampaign(
          updatedCampaign,
          shouldSyncPlayerInitiative(selectedCampaign, updatedCampaign),
        )

        return { ok: true, ...saved, participantId: participant?.id }
      } catch {
        setLastError('Не удалось добавить участника инициативы.')
        setStatus('error')
        return { ok: false, reason: 'create-combat-participant-failed' }
      }
    },
    [saveCombatCampaign, selectedCampaign],
  )

  const updateCombatParticipant = useCallback(
    async (
      participantId: CombatParticipantId,
      input: CombatParticipantInput,
    ): Promise<CombatMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для редактирования инициативы.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithUpdatedCombatParticipant(selectedCampaign, participantId, input)
        const saved = await saveCombatCampaign(
          updatedCampaign,
          shouldSyncPlayerInitiative(selectedCampaign, updatedCampaign),
        )

        return { ok: true, ...saved, participantId }
      } catch {
        setLastError('Не удалось сохранить участника инициативы.')
        setStatus('error')
        return { ok: false, reason: 'update-combat-participant-failed' }
      }
    },
    [saveCombatCampaign, selectedCampaign],
  )

  const deleteCombatParticipant = useCallback(
    async (participantId: CombatParticipantId): Promise<CombatMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для удаления участника инициативы.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithoutCombatParticipant(selectedCampaign, participantId)
        const saved = await saveCombatCampaign(
          updatedCampaign,
          shouldSyncPlayerInitiative(selectedCampaign, updatedCampaign),
        )

        return { ok: true, ...saved, participantId }
      } catch {
        setLastError('Не удалось удалить участника инициативы.')
        setStatus('error')
        return { ok: false, reason: 'delete-combat-participant-failed' }
      }
    },
    [saveCombatCampaign, selectedCampaign],
  )

  const startCombat = useCallback(async (): Promise<CombatMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для старта инициативы.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = createCampaignWithCombatStarted(selectedCampaign)
      const saved = await saveCombatCampaign(
        updatedCampaign,
        shouldSyncPlayerInitiative(selectedCampaign, updatedCampaign),
      )

      return { ok: true, ...saved }
    } catch {
      setLastError('Не удалось начать инициативу.')
      setStatus('error')
      return { ok: false, reason: 'start-combat-failed' }
    }
  }, [saveCombatCampaign, selectedCampaign])

  const stopCombat = useCallback(async (): Promise<CombatMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для остановки инициативы.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = createCampaignWithCombatStopped(selectedCampaign)
      const saved = await saveCombatCampaign(
        updatedCampaign,
        shouldSyncPlayerInitiative(selectedCampaign, updatedCampaign),
      )

      return { ok: true, ...saved }
    } catch {
      setLastError('Не удалось остановить инициативу.')
      setStatus('error')
      return { ok: false, reason: 'stop-combat-failed' }
    }
  }, [saveCombatCampaign, selectedCampaign])

  const advanceCombatTurn = useCallback(async (): Promise<CombatMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для следующего хода.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = createCampaignWithNextCombatTurn(selectedCampaign)
      const saved = await saveCombatCampaign(
        updatedCampaign,
        shouldSyncPlayerInitiative(selectedCampaign, updatedCampaign),
      )

      return { ok: true, ...saved }
    } catch {
      setLastError('Не удалось перейти к следующему ходу.')
      setStatus('error')
      return { ok: false, reason: 'advance-combat-turn-failed' }
    }
  }, [saveCombatCampaign, selectedCampaign])

  const advanceCombatRound = useCallback(async (): Promise<CombatMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для следующего раунда.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = createCampaignWithNextCombatRound(selectedCampaign)
      const saved = await saveCombatCampaign(
        updatedCampaign,
        shouldSyncPlayerInitiative(selectedCampaign, updatedCampaign),
      )

      return { ok: true, ...saved }
    } catch {
      setLastError('Не удалось перейти к следующему раунду.')
      setStatus('error')
      return { ok: false, reason: 'advance-combat-round-failed' }
    }
  }, [saveCombatCampaign, selectedCampaign])

  const setPlayerInitiativeVisible = useCallback(
    async (isVisible: boolean): Promise<CombatMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для показа инициативы.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithPlayerInitiativeVisibility(selectedCampaign, isVisible)
        const saved = await saveCombatCampaign(updatedCampaign, true)

        return { ok: true, ...saved }
      } catch {
        setLastError('Не удалось обновить видимость инициативы.')
        setStatus('error')
        return { ok: false, reason: 'set-initiative-visible-failed' }
      }
    },
    [saveCombatCampaign, selectedCampaign],
  )

  const moveActiveSceneObject = useCallback(
    async (
      objectId: SceneCanvasObjectId,
      direction: SceneObjectMoveDirection,
    ): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для перемещения объекта сцены.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithMovedActiveSceneObject(selectedCampaign, objectId, direction),
        )
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось переместить объект сцены.')
        setStatus('error')
        return { ok: false, reason: 'move-scene-object-failed' }
      }
    },
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
  )

  const positionActiveSceneObject = useCallback(
    async (
      objectId: SceneCanvasObjectId,
      position: SceneCanvasObjectPosition,
    ): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для перемещения объекта сцены.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithPositionedActiveSceneObject(selectedCampaign, objectId, position),
        )
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось переместить объект сцены.')
        setStatus('error')
        return { ok: false, reason: 'position-scene-object-failed' }
      }
    },
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
  )

  const duplicateActiveSceneObject = useCallback(
    async (objectId: SceneCanvasObjectId): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для дублирования объекта сцены.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithDuplicatedActiveSceneObject(selectedCampaign, objectId),
        )
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось дублировать объект сцены.')
        setStatus('error')
        return { ok: false, reason: 'duplicate-scene-object-failed' }
      }
    },
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
  )

  const setActiveSceneObjectVisibility = useCallback(
    async (
      objectId: SceneCanvasObjectId,
      isPlayerVisible: boolean,
    ): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для изменения видимости объекта сцены.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithActiveSceneObjectVisibility(selectedCampaign, objectId, isPlayerVisible),
        )
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось изменить видимость объекта сцены.')
        setStatus('error')
        return { ok: false, reason: 'update-scene-object-visibility-failed' }
      }
    },
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
  )

  const updateActiveSceneObjectTokenState = useCallback(
    async (
      objectId: SceneCanvasObjectId,
      tokenState: SceneCanvasObjectTokenState,
    ): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для обновления карточки токена.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithActiveSceneObjectTokenState(selectedCampaign, objectId, tokenState),
        )
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign }
      } catch {
        setLastError('Не удалось обновить карточку токена.')
        setStatus('error')
        return { ok: false, reason: 'update-scene-object-token-state-failed' }
      }
    },
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
  )

  const importImageAsset = useCallback(
    async (
      kind: ImageAssetKind,
      suggestedName?: string,
      tags?: string[],
      userLayer: SceneUserLayerId = 'map',
    ): Promise<AssetMutationResult> => {
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

        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithImportedAsset(selectedCampaign, result.asset, {
            bindMapToActiveScene: userLayer === 'map',
          }),
        )
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
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
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
        await saveCampaignWithStatus(updatedCampaign)
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
    [saveCampaignWithStatus, selectedCampaign],
  )

  const selectIndexedAsset = useCallback(
    async (
      indexedAsset: AssetLibraryItem,
      kind: ImageAssetKind,
      exportPolicy: CampaignAssetExportPolicy,
    ): Promise<AssetMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для выбора ассета из общей библиотеки.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const existingAsset = selectedCampaign.assets.find(
          (asset) =>
            asset.storageRef?.kind !== 'embedded-data' &&
            asset.storageRef?.indexedAssetId === indexedAsset.id,
        )
        const managedSelection = await desktopApi.assetLibrary.manageForCampaign({
          campaignId: selectedCampaign.id,
          indexedAssetId: indexedAsset.id,
          assetId: existingAsset?.id,
          exportPolicy,
        })
        if (!managedSelection.ok) {
          const errorMessages = {
            'asset-not-found': 'Ассет больше не найден в каталоге. Обновите библиотеку.',
            'asset-unavailable': 'Исходный файл недоступен, а управляемая копия ещё не создана.',
            'asset-checksum-missing': 'Для ассета не вычислен SHA-256. Пересканируйте папку.',
            'source-changed': 'Исходный файл изменился после индексации. Пересканируйте папку и повторите выбор.',
            'storage-failed': 'Не удалось скопировать ассет в управляемое хранилище.',
            'desktop-api-unavailable': 'Управляемое хранилище доступно только в настольном приложении.',
          } satisfies Record<typeof managedSelection.reason, string>
          setLastError(errorMessages[managedSelection.reason])
          setStatus('error')
          return { ok: false, reason: managedSelection.reason }
        }
        const updatedCampaign = createCampaignWithIndexedAsset(
          selectedCampaign,
          indexedAsset,
          managedSelection,
          kind,
          exportPolicy,
        )
        const selectedAsset = updatedCampaign.assets.find(
          (asset) => asset.id === managedSelection.assetId,
        )
        if (!selectedAsset) {
          throw new Error('indexed-asset-selection-failed')
        }
        await saveCampaignWithStatus(updatedCampaign)
        setSelectedCampaign(updatedCampaign)
        setCampaigns(await desktopApi.storage.listCampaigns())
        setStatus('ready')
        return { ok: true, campaign: updatedCampaign, assetId: selectedAsset.id }
      } catch {
        setLastError('Не удалось добавить ассет из общей библиотеки в кампанию.')
        setStatus('error')
        return { ok: false, reason: 'select-indexed-asset-failed' }
      }
    },
    [saveCampaignWithStatus, selectedCampaign],
  )

  const applyAssetToActiveScene = useCallback(
    async (assetId: AssetId, userLayer?: SceneUserLayerId): Promise<AssetMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для использования ассета.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = await saveCampaignWithLivePlayerProjection(
          createCampaignWithAssetInActiveScene(selectedCampaign, assetId, { userLayer }),
        )
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
    [saveCampaignWithLivePlayerProjection, selectedCampaign],
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
        await saveCampaignWithStatus(updatedCampaign)
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
    [saveCampaignWithStatus, selectedCampaign],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    campaigns,
    campaignsDirectory,
    selectedCampaign,
    status,
    lastError,
    saveState,
    historyState,
    refresh,
    selectCampaignsDirectory,
    createCampaign,
    openCampaign,
    saveSelectedCampaign,
    saveSelectedCampaignToDirectory,
    deleteSelectedCampaign,
    importProject,
    previewSelectedProjectExport,
    exportSelectedProject,
    createScene,
    activateScene,
    sendActiveSceneToPlayers,
    clearPlayerScreen,
    updateActiveSceneGrid,
    updateActiveSceneViewport,
    updatePlayerSceneViewport,
    addActiveSceneMeasurement,
    clearActiveSceneMeasurements,
    updateActiveSceneFog,
    addActiveSceneFogRegion,
    updateActiveSceneFogRegion,
    removeLastActiveSceneFogRegion,
    clearActiveSceneFogRegions,
    createCharacterCard,
    updateCharacterCard,
    deleteCharacterCard,
    createNote,
    updateNote,
    deleteNote,
    sendNoteToPlayers,
    hidePlayerHandout,
    createCombatParticipant,
    updateCombatParticipant,
    deleteCombatParticipant,
    startCombat,
    stopCombat,
    advanceCombatTurn,
    advanceCombatRound,
    setPlayerInitiativeVisible,
    moveActiveSceneObject,
    positionActiveSceneObject,
    duplicateActiveSceneObject,
    setActiveSceneObjectVisibility,
    updateActiveSceneObjectTokenState,
    importImageAsset,
    selectIndexedAsset,
    updateAssetTags,
    applyAssetToActiveScene,
    sendAssetToPlayers,
    undoSelectedCampaign,
    redoSelectedCampaign,
  }
}

export type CampaignsStore = ReturnType<typeof useCampaignsStore>

function shouldSyncPlayerInitiative(previousCampaign: Campaign, updatedCampaign: Campaign): boolean {
  return previousCampaign.playerScreenState.initiativeVisible || updatedCampaign.playerScreenState.initiativeVisible
}

function createInitialSaveState(): CampaignSaveState {
  return {
    status: 'idle',
    isDirty: false,
    lastSavedAt: null,
    lastError: null,
    autosaveDelayMs: AUTOSAVE_DELAY_MS,
  }
}

function createInitialHistoryState(): CampaignHistoryState {
  return {
    undoCount: 0,
    redoCount: 0,
  }
}

function getProjectTransferErrorMessage(
  reason: ProjectTransferFailureReason,
  operation: 'import' | 'export',
): string {
  switch (reason) {
    case 'invalid-package':
      return 'Файл проекта повреждён или имеет неверный формат.'
    case 'unsupported-version':
      return 'Версия файла проекта пока не поддерживается.'
    case 'unsupported-asset-path':
      return 'Проект содержит неподдерживаемую ссылку на ассет.'
    case 'asset-read-failed':
      return 'Не удалось прочитать один из локальных ассетов проекта.'
    case 'preview-outdated':
      return 'Кампания или её ассеты изменились после предварительного просмотра. Откройте экспорт заново.'
    case 'desktop-api-unavailable':
      return 'Импорт и экспорт доступны только в desktop-приложении.'
    case 'campaign-not-found':
      return 'Выбранный проект не найден.'
    case 'read-failed':
      return 'Не удалось прочитать файл проекта.'
    case 'write-failed':
      return operation === 'import'
        ? 'Не удалось сохранить импортированный проект.'
        : 'Не удалось записать файл проекта.'
    case 'cancelled':
      return operation === 'import' ? 'Импорт отменён.' : 'Экспорт отменён.'
  }
}

function cloneCampaignSnapshot(campaign: Campaign): Campaign {
  return JSON.parse(JSON.stringify(campaign)) as Campaign
}

function areCampaignSnapshotsEqual(left: Campaign, right: Campaign): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function limitCampaignHistory(history: Campaign[]): Campaign[] {
  return history.slice(-CAMPAIGN_HISTORY_LIMIT)
}
