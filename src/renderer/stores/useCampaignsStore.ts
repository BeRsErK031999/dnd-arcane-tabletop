import { useCallback, useEffect, useState } from 'react'
import { desktopApi } from '@renderer/services/desktopApi'
import type {
  AssetId,
  Campaign,
  CampaignId,
  CampaignSummary,
  CharacterCardId,
  CombatParticipantId,
  ImageAssetKind,
  NoteId,
  PlayerScreenCommandResult,
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
} from './assetFactory'
import { createEmptyCampaign, createUpdatedCampaignMetadata } from './campaignFactory'
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
  createCampaignWithHydratedScenes,
  createCampaignWithNewScene,
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
  createCampaignWithDuplicatedActiveSceneObject,
  createCampaignWithMovedActiveSceneObject,
  createCampaignWithoutActiveSceneFogRegions,
  createCampaignWithoutActiveSceneMeasurements,
  createCampaignWithoutLastActiveSceneFogRegion,
  type SceneFogRegionTemplate,
  type SceneMeasurementTemplate,
  type SceneObjectMoveDirection,
} from './sceneToolsFactory'

export type CampaignsStoreStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'deleting' | 'error'
export type CampaignMutationResult = { ok: true; campaign: Campaign } | { ok: false; reason: string }
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

      const hydratedCampaign = createCampaignWithHydratedCombatState(
        createCampaignWithHydratedNotes(
          createCampaignWithHydratedCharacterCards(createCampaignWithHydratedScenes(campaign)),
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

  const updateActiveSceneFog = useCallback(
    async (fog: Partial<Pick<SceneCanvasFogState, 'enabled' | 'opacity'>>): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для настройки тумана войны.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithActiveSceneFog(selectedCampaign, fog)
        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
  )

  const addActiveSceneFogRegion = useCallback(
    async (shape: SceneFogRegionTemplate): Promise<CampaignMutationResult> => {
      if (selectedCampaign === null) {
        setLastError('Нет открытой кампании для добавления тумана войны.')
        return { ok: false, reason: 'campaign-not-selected' }
      }

      setStatus('saving')
      setLastError(null)

      try {
        const updatedCampaign = createCampaignWithActiveSceneFogRegion(selectedCampaign, shape)
        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
  )

  const removeLastActiveSceneFogRegion = useCallback(async (): Promise<CampaignMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для открытия области тумана.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = createCampaignWithoutLastActiveSceneFogRegion(selectedCampaign)
      await desktopApi.storage.saveCampaign(updatedCampaign)
      setSelectedCampaign(updatedCampaign)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return { ok: true, campaign: updatedCampaign }
    } catch {
      setLastError('Не удалось открыть область тумана.')
      setStatus('error')
      return { ok: false, reason: 'remove-fog-region-failed' }
    }
  }, [selectedCampaign])

  const clearActiveSceneFogRegions = useCallback(async (): Promise<CampaignMutationResult> => {
    if (selectedCampaign === null) {
      setLastError('Нет открытой кампании для очистки тумана войны.')
      return { ok: false, reason: 'campaign-not-selected' }
    }

    setStatus('saving')
    setLastError(null)

    try {
      const updatedCampaign = createCampaignWithoutActiveSceneFogRegions(selectedCampaign)
      await desktopApi.storage.saveCampaign(updatedCampaign)
      setSelectedCampaign(updatedCampaign)
      setCampaigns(await desktopApi.storage.listCampaigns())
      setStatus('ready')
      return { ok: true, campaign: updatedCampaign }
    } catch {
      setLastError('Не удалось очистить туман войны.')
      setStatus('error')
      return { ok: false, reason: 'clear-fog-failed' }
    }
  }, [selectedCampaign])

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

        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
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
        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
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
        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
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

        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
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
        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
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
        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
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
        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
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
      await desktopApi.storage.saveCampaign(updatedCampaign)
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
  }, [selectedCampaign])

  const saveCombatCampaign = useCallback(
    async (
      updatedCampaign: Campaign,
      shouldSyncPlayerScreen: boolean,
    ): Promise<{ campaign: Campaign; playerStatus?: PlayerScreenCommandResult }> => {
      await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [],
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
        const updatedCampaign = createCampaignWithMovedActiveSceneObject(selectedCampaign, objectId, direction)
        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
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
        const updatedCampaign = createCampaignWithDuplicatedActiveSceneObject(selectedCampaign, objectId)
        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
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
        const updatedCampaign = createCampaignWithActiveSceneObjectVisibility(
          selectedCampaign,
          objectId,
          isPlayerVisible,
        )
        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
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
        const updatedCampaign = createCampaignWithActiveSceneObjectTokenState(
          selectedCampaign,
          objectId,
          tokenState,
        )
        await desktopApi.storage.saveCampaign(updatedCampaign)
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
    [selectedCampaign],
  )

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
    updateActiveSceneFog,
    addActiveSceneFogRegion,
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
    duplicateActiveSceneObject,
    setActiveSceneObjectVisibility,
    updateActiveSceneObjectTokenState,
    importImageAsset,
    updateAssetTags,
    applyAssetToActiveScene,
    sendAssetToPlayers,
  }
}

function shouldSyncPlayerInitiative(previousCampaign: Campaign, updatedCampaign: Campaign): boolean {
  return previousCampaign.playerScreenState.initiativeVisible || updatedCampaign.playerScreenState.initiativeVisible
}
