import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createAssetLibraryView,
  normalizeAssetTags,
  type AssetLibraryKindFilter,
} from '@renderer/stores/assetFactory'
import { createCharacterCardList, type CharacterCardInput } from '@renderer/stores/characterCardFactory'
import { createCombatParticipantList, type CombatParticipantInput } from '@renderer/stores/combatFactory'
import { createNoteList, type NoteInput } from '@renderer/stores/noteFactory'
import { WORKSPACE_NAVIGATION_EVENT } from '@shared/constants'
import { desktopApi } from '@renderer/services/desktopApi'
import { getSceneCanvasState, type SceneUserLayerId } from '@renderer/stores/sceneCanvasFactory'
import type { CampaignsStore } from '@renderer/stores/useCampaignsStore'
import type {
  SceneCanvasObjectPosition,
  SceneFogRegionInput,
  SceneFogRegionUpdate,
  SceneMeasurementInput,
  SceneObjectMoveDirection,
} from '@renderer/stores/sceneToolsFactory'
import { SceneCanvas } from '@renderer/widgets/SceneCanvas'
import { AssetManagerPanel } from '@renderer/widgets/AssetManagerPanel'
import {
  createDefaultPlayerScreenState,
  type Asset,
  type AssetId,
  type AssetKind,
  type Campaign,
  type CharacterCard,
  type CharacterCardId,
  type CharacterCardKind,
  type CombatParticipant,
  type CombatParticipantId,
  type CombatState,
  type ImageAssetKind,
  type Note,
  type NoteId,
  type NoteScope,
  type PlayerScreenCommandResult,
  type PlayerScreenOpenResult,
  type PlayerScreenState,
  type PlayerScreenStatus,
  type SceneCanvasFogRegionId,
  type SceneCanvasFogState,
  type SceneCanvasObjectId,
  type SceneCanvasObjectTokenState,
  type SceneCanvasViewport,
  type SceneGrid,
  type Scene,
} from '@shared/types'

type PlayerActionResult = PlayerScreenCommandResult | PlayerScreenOpenResult
type RightPanelTab = 'assets' | 'characters' | 'notes'
type WorkspaceSection = 'scenes' | 'assets' | 'combat' | 'notes' | 'players'

interface CharacterCardDraft {
  name: string
  kind: CharacterCardKind
  playerName: string
  description: string
  armorClass: string
  hitPointsCurrent: string
  hitPointsMaximum: string
  hitPointsTemporary: string
  initiativeModifier: string
  portraitAssetId: string
  notes: string
}

const emptyCharacterCardDraft: CharacterCardDraft = {
  name: '',
  kind: 'player',
  playerName: '',
  description: '',
  armorClass: '',
  hitPointsCurrent: '',
  hitPointsMaximum: '',
  hitPointsTemporary: '',
  initiativeModifier: '',
  portraitAssetId: '',
  notes: '',
}

interface NoteDraft {
  title: string
  body: string
  scope: NoteScope
}

const emptyNoteDraft: NoteDraft = {
  title: '',
  body: '',
  scope: 'master',
}

interface CombatParticipantDraft {
  name: string
  initiative: string
  isPlayerControlled: boolean
  isDefeated: boolean
}

const emptyCombatParticipantDraft: CombatParticipantDraft = {
  name: '',
  initiative: '',
  isPlayerControlled: false,
  isDefeated: false,
}

interface ToolItem {
  label: string
  icon: string
  shortcut: string
  description: string
}

const toolGroups: Array<{ title: string; items: ToolItem[] }> = [
  {
    title: 'Навигация',
    items: [
      { label: 'Обзор', icon: 'V', shortcut: 'V', description: 'Обзор сцены' },
      { label: 'Панорама', icon: 'P', shortcut: 'Space', description: 'Панорамирование сцены' },
      { label: 'Масштаб', icon: 'Z', shortcut: 'Z', description: 'Масштаб сцены' },
    ],
  },
  {
    title: 'Сцена',
    items: [
      { label: 'Сетка', icon: '#', shortcut: 'G', description: 'Настройки сетки' },
      { label: 'Измерение', icon: 'M', shortcut: 'M', description: 'Линейки и области' },
      { label: 'Область', icon: 'A', shortcut: 'A', description: 'Шаблоны областей' },
      { label: 'Туман', icon: 'F', shortcut: 'F', description: 'Туман войны' },
      { label: 'Инициатива', icon: 'I', shortcut: 'I', description: 'Tracker инициативы' },
    ],
  },
  {
    title: 'Показ игрокам',
    items: [
      { label: 'Сцена игрокам', icon: 'S', shortcut: 'P', description: 'Отправить сцену игрокам' },
      { label: 'Handout', icon: 'H', shortcut: 'H', description: 'Показать handout игрокам' },
    ],
  },
]

interface MasterDashboardPageProps {
  campaignsStore: CampaignsStore
}

export function MasterDashboardPage({ campaignsStore }: MasterDashboardPageProps) {
  const {
    selectedCampaign,
    status,
    lastError,
    saveState,
    historyState,
    saveSelectedCampaign,
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
  } = campaignsStore
  const [activeWorkspaceSection, setActiveWorkspaceSection] = useState<WorkspaceSection>('scenes')
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanelTab>('assets')
  const [isToolRailOpen, setIsToolRailOpen] = useState(false)
  const [isSceneComposerOpen, setIsSceneComposerOpen] = useState(false)
  const [isMaterialsPanelOpen, setIsMaterialsPanelOpen] = useState(() => window.innerWidth >= 1280)
  const [activeUserLayer, setActiveUserLayer] = useState<SceneUserLayerId>('tokens')
  const [campaignActionStatus, setCampaignActionStatus] = useState('Автосохранение включено.')
  const [newSceneName, setNewSceneName] = useState('')
  const [newSceneDescription, setNewSceneDescription] = useState('')
  const [sceneActionStatus, setSceneActionStatus] = useState(() =>
    selectedCampaign === null
      ? 'Откройте проект, чтобы управлять сценами.'
      : selectedCampaign.scenes.length === 0
        ? 'Создайте первую сцену проекта.'
        : `Активна сцена «${selectedCampaign.scenes.find((scene) => scene.isActive)?.name ?? selectedCampaign.scenes[0]?.name}».`,
  )
  const [assetKind, setAssetKind] = useState<ImageAssetKind>('map')
  const [assetKindFilter, setAssetKindFilter] = useState<AssetLibraryKindFilter>('all')
  const [assetName, setAssetName] = useState('')
  const [assetImportTags, setAssetImportTags] = useState('')
  const [assetSearchQuery, setAssetSearchQuery] = useState('')
  const [assetSelectedTags, setAssetSelectedTags] = useState<string[]>([])
  const [assetTagDrafts, setAssetTagDrafts] = useState<Record<AssetId, string>>({})
  const [assetActionStatus, setAssetActionStatus] = useState(() =>
    selectedCampaign === null
      ? 'Откройте проект, чтобы импортировать изображения.'
      : 'Материалы проекта готовы к редактированию.',
  )
  const [selectedSceneObjectId, setSelectedSceneObjectId] = useState<SceneCanvasObjectId | null>(null)
  const [selectedCharacterCardId, setSelectedCharacterCardId] = useState<CharacterCardId | null>(null)
  const [characterDraft, setCharacterDraft] = useState<CharacterCardDraft>(emptyCharacterCardDraft)
  const [characterActionStatus, setCharacterActionStatus] = useState(() =>
    selectedCampaign === null ? 'Откройте проект, чтобы создавать карточки.' : 'Карточки персонажей готовы к редактированию.',
  )
  const [selectedNoteId, setSelectedNoteId] = useState<NoteId | null>(null)
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(emptyNoteDraft)
  const [noteActionStatus, setNoteActionStatus] = useState(() =>
    selectedCampaign === null ? 'Откройте проект, чтобы вести заметки.' : 'Заметки проекта готовы к редактированию.',
  )
  const [selectedCombatParticipantId, setSelectedCombatParticipantId] = useState<CombatParticipantId | null>(null)
  const [combatDraft, setCombatDraft] = useState<CombatParticipantDraft>(emptyCombatParticipantDraft)
  const [combatActionStatus, setCombatActionStatus] = useState(() =>
    selectedCampaign === null ? 'Откройте проект, чтобы вести инициативу.' : 'Tracker инициативы готов к ручному ведению.',
  )
  const [playerStatus, setPlayerStatus] = useState<PlayerScreenStatus>(() => ({
    isOpen: false,
    isFullscreen: false,
    state: createDefaultPlayerScreenState(),
  }))
  const [playerActionStatus, setPlayerActionStatus] = useState('Готов к управлению экраном игроков.')

  const activeScene = useMemo(
    () => selectedCampaign?.scenes.find((scene) => scene.isActive) ?? selectedCampaign?.scenes[0] ?? null,
    [selectedCampaign],
  )
  const activeMapAsset = useMemo(
    () =>
      activeScene?.backgroundAssetId
        ? selectedCampaign?.assets.find((asset) => asset.id === activeScene.backgroundAssetId) ?? null
        : null,
    [activeScene, selectedCampaign],
  )
  const characterCards = useMemo(
    () =>
      selectedCampaign
        ? createCharacterCardList(selectedCampaign.characterCards, selectedCampaign.id)
        : [],
    [selectedCampaign],
  )
  const notes = useMemo(
    () => (selectedCampaign ? createNoteList(selectedCampaign.notes, selectedCampaign.id) : []),
    [selectedCampaign],
  )
  const combatParticipants = useMemo(
    () => (selectedCampaign ? createCombatParticipantList(selectedCampaign.combatState, selectedCampaign.id) : []),
    [selectedCampaign],
  )
  const selectedCharacterCard = useMemo(
    () => characterCards.find((card) => card.id === selectedCharacterCardId) ?? null,
    [characterCards, selectedCharacterCardId],
  )
  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  )
  const selectedCombatParticipant = useMemo(
    () => combatParticipants.find((participant) => participant.id === selectedCombatParticipantId) ?? null,
    [combatParticipants, selectedCombatParticipantId],
  )
  const portraitAssets = useMemo(
    () => (selectedCampaign?.assets ?? []).filter((asset) => asset.kind === 'portrait' || asset.kind === 'token'),
    [selectedCampaign?.assets],
  )

  useEffect(() => {
    window.history.scrollRestoration = 'manual'
    window.scrollTo({ top: 0, left: 0 })
  }, [])

  useEffect(() => {
    if (
      selectedCampaign === null ||
      playerStatus.state.campaignId !== selectedCampaign.id ||
      playerStatus.state.sceneCanvas === undefined
    ) {
      return
    }

    const storedViewport = selectedCampaign.playerScreenState.playerViewport
    const liveViewport = playerStatus.state.playerViewport

    if (
      storedViewport.zoom === liveViewport.zoom &&
      storedViewport.panX === liveViewport.panX &&
      storedViewport.panY === liveViewport.panY
    ) {
      return
    }

    void updatePlayerSceneViewport(liveViewport)
  }, [playerStatus.state, selectedCampaign, updatePlayerSceneViewport])

  useEffect(() => {
    function handleWorkspaceNavigation(event: Event): void {
      const section = getWorkspaceNavigationSection(event)

      if (section === null) {
        return
      }

      setActiveWorkspaceSection(section)
      setIsToolRailOpen(false)

      if (section === 'notes') {
        setActiveRightPanel('notes')
      }

      window.requestAnimationFrame(() => {
        if (section === 'scenes') {
          document.querySelector('.scene-strip__items')?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
          return
        }
        document.querySelector('.workspace-utility-drawer__body')?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
      })
    }

    window.addEventListener(WORKSPACE_NAVIGATION_EVENT, handleWorkspaceNavigation)

    return () => {
      window.removeEventListener(WORKSPACE_NAVIGATION_EVENT, handleWorkspaceNavigation)
    }
  }, [])

  useEffect(() => {
    if (activeWorkspaceSection === 'scenes') {
      return
    }

    function closeUtilityPanel(event: KeyboardEvent): void {
      if (event.key !== 'Escape') {
        return
      }
      setActiveWorkspaceSection('scenes')
      window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_EVENT, { detail: { section: 'scenes' } }))
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>('[data-nav-section="scenes"]')?.focus()
      })
    }

    window.addEventListener('keydown', closeUtilityPanel)
    return () => window.removeEventListener('keydown', closeUtilityPanel)
  }, [activeWorkspaceSection])

  useEffect(() => {
    if (selectedSceneObjectId === null) {
      return
    }

    if (activeScene === null) {
      setSelectedSceneObjectId(null)
      return
    }

    const canvas = getSceneCanvasState(activeScene)

    if (!canvas.objects.some((object) => object.id === selectedSceneObjectId)) {
      setSelectedSceneObjectId(null)
    }
  }, [activeScene, selectedSceneObjectId])

  const rightPanelTabs: Array<{ id: RightPanelTab; label: string; count: number }> = [
    { id: 'assets', label: 'Ассеты', count: selectedCampaign?.assets.length ?? 0 },
    { id: 'characters', label: 'Персонажи', count: selectedCampaign?.characterCards.length ?? 0 },
    { id: 'notes', label: 'Заметки', count: selectedCampaign?.notes.length ?? 0 },
  ]

  const isStorageBusy = status === 'loading' || status === 'saving' || status === 'deleting'
  const hasSelectedCampaign = selectedCampaign !== null
  const selectedCampaignId = selectedCampaign?.id ?? null
  const activePlayerHandoutId = playerStatus.state.isHidden ? null : playerStatus.state.handoutPreview?.id ?? null
  const isPlayerHandoutVisible = playerStatus.state.mode === 'image' && activePlayerHandoutId !== null
  const activeCombatParticipant = selectedCampaign?.combatState.isActive
    ? combatParticipants[selectedCampaign.combatState.turnIndex] ?? null
    : null
  const saveStatusLabel = getCampaignSaveStatusLabel(saveState.status)
  const saveStatusDetail =
    saveState.lastSavedAt === null
      ? `Автосохранение через ${(saveState.autosaveDelayMs / 1000).toFixed(1)} с`
      : `Последнее сохранение: ${formatTimestamp(saveState.lastSavedAt)}`

  useEffect(() => {
    let isMounted = true

    void desktopApi.playerScreen.getStatus().then((status) => {
      if (isMounted) {
        setPlayerStatus(status)
      }
    })

    const unsubscribe = desktopApi.playerScreen.onStatusChanged((status) => {
      setPlayerStatus(status)
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    function handleKeyboardShortcut(event: KeyboardEvent): void {
      const hasShortcutModifier = event.ctrlKey || event.metaKey

      if (!hasShortcutModifier || event.altKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 's') {
        event.preventDefault()

        if (!hasSelectedCampaign || isStorageBusy) {
          return
        }

        void saveSelectedCampaign(selectedCampaign.name, selectedCampaign.description).then((result) => {
          setCampaignActionStatus(
            result.ok ? `Кампания "${result.campaign.name}" сохранена в JSON.` : 'Не удалось сохранить кампанию.',
          )
        })
        return
      }

      if (isEditableShortcutTarget(event.target)) {
        return
      }

      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()

        if (!hasSelectedCampaign || isStorageBusy || historyState.undoCount === 0) {
          return
        }

        void undoSelectedCampaign().then((result) => {
          setCampaignActionStatus(result.ok ? 'Последнее действие отменено.' : 'Нет действия для отмены.')
        })
        return
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()

        if (!hasSelectedCampaign || isStorageBusy || historyState.redoCount === 0) {
          return
        }

        void redoSelectedCampaign().then((result) => {
          setCampaignActionStatus(result.ok ? 'Действие повторено.' : 'Нет действия для повтора.')
        })
      }
    }

    window.addEventListener('keydown', handleKeyboardShortcut)

    return () => {
      window.removeEventListener('keydown', handleKeyboardShortcut)
    }
  }, [
    hasSelectedCampaign,
    historyState.redoCount,
    historyState.undoCount,
    isStorageBusy,
    redoSelectedCampaign,
    saveSelectedCampaign,
    selectedCampaign,
    undoSelectedCampaign,
  ])

  useEffect(() => {
    function handleAppHotkey(event: KeyboardEvent): void {
      if (event.altKey || event.ctrlKey || event.metaKey || isEditableShortcutTarget(event.target)) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'i') {
        event.preventDefault()
        setActiveWorkspaceSection('combat')
        window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_EVENT, { detail: { section: 'combat' } }))
        return
      }

      if (key === 'h') {
        event.preventDefault()
        setActiveWorkspaceSection('notes')
        setActiveRightPanel('notes')
        window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_EVENT, { detail: { section: 'notes' } }))
        return
      }

      if (key === 'p') {
        event.preventDefault()

        if (!hasSelectedCampaign || activeScene === null || isStorageBusy) {
          return
        }

        void sendActiveSceneToPlayers().then((result) => {
          if (result.ok) {
            const sceneName = result.campaign.playerScreenState.scenePreview?.name ?? 'активная сцена'

            setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
            setSceneActionStatus(`Сцена "${sceneName}" отправлена игрокам.`)
            setPlayerActionStatus(`Сцена "${sceneName}" отправлена игрокам.`)
            return
          }

          setSceneActionStatus('Не удалось отправить активную сцену игрокам.')
        })
      }
    }

    window.addEventListener('keydown', handleAppHotkey)

    return () => {
      window.removeEventListener('keydown', handleAppHotkey)
    }
  }, [activeScene, hasSelectedCampaign, isStorageBusy, sendActiveSceneToPlayers])

  useEffect(() => {
    setSelectedCharacterCardId(null)
    setCharacterDraft(emptyCharacterCardDraft)
    setCharacterActionStatus(
      !hasSelectedCampaign
        ? 'Откройте кампанию, чтобы создавать карточки.'
        : 'Карточки персонажей готовы к редактированию.',
    )
  }, [hasSelectedCampaign, selectedCampaignId])

  useEffect(() => {
    setSelectedNoteId(null)
    setNoteDraft(emptyNoteDraft)
    setNoteActionStatus(
      !hasSelectedCampaign ? 'Откройте кампанию, чтобы вести заметки.' : 'Заметки кампании готовы к редактированию.',
    )
  }, [hasSelectedCampaign, selectedCampaignId])

  useEffect(() => {
    setSelectedCombatParticipantId(null)
    setCombatDraft(emptyCombatParticipantDraft)
    setCombatActionStatus(
      !hasSelectedCampaign
        ? 'Откройте кампанию, чтобы вести инициативу.'
        : 'Tracker инициативы готов к ручному ведению.',
    )
  }, [hasSelectedCampaign, selectedCampaignId])

  useEffect(() => {
    if (selectedCharacterCardId === null) {
      return
    }

    if (!characterCards.some((card) => card.id === selectedCharacterCardId)) {
      setSelectedCharacterCardId(null)
      setCharacterDraft(emptyCharacterCardDraft)
    }
  }, [characterCards, selectedCharacterCardId])

  useEffect(() => {
    if (selectedNoteId === null) {
      return
    }

    if (!notes.some((note) => note.id === selectedNoteId)) {
      setSelectedNoteId(null)
      setNoteDraft(emptyNoteDraft)
    }
  }, [notes, selectedNoteId])

  useEffect(() => {
    if (selectedCombatParticipantId === null) {
      return
    }

    if (!combatParticipants.some((participant) => participant.id === selectedCombatParticipantId)) {
      setSelectedCombatParticipantId(null)
      setCombatDraft(emptyCombatParticipantDraft)
    }
  }, [combatParticipants, selectedCombatParticipantId])

  useEffect(() => {
    const assets = selectedCampaign?.assets ?? []
    setAssetTagDrafts(Object.fromEntries(assets.map((asset) => [asset.id, asset.tags.join(', ')])))
    setAssetSelectedTags((tags) => {
      const availableTags = new Set(assets.flatMap((asset) => asset.tags))
      return tags.filter((tag) => availableTags.has(tag))
    })
  }, [selectedCampaign?.assets])

  async function handleSaveCampaign(): Promise<void> {
    if (!selectedCampaign) {
      setCampaignActionStatus('Нет открытой кампании для сохранения.')
      return
    }

    const result = await saveSelectedCampaign(selectedCampaign.name, selectedCampaign.description)

    if (result.ok) {
      setCampaignActionStatus(`Кампания "${result.campaign.name}" сохранена в JSON.`)
      return
    }

    setCampaignActionStatus('Не удалось сохранить кампанию.')
  }

  async function handleUndoCampaign(): Promise<void> {
    const result = await undoSelectedCampaign()

    if (result.ok) {
      setCampaignActionStatus('Последнее действие отменено.')
      return
    }

    setCampaignActionStatus('Нет действия для отмены.')
  }

  async function handleRedoCampaign(): Promise<void> {
    const result = await redoSelectedCampaign()

    if (result.ok) {
      setCampaignActionStatus('Действие повторено.')
      return
    }

    setCampaignActionStatus('Нет действия для повтора.')
  }

  async function handleCreateScene(): Promise<void> {
    const result = await createScene(newSceneName, newSceneDescription)

    if (result.ok) {
      const createdScene = result.campaign.scenes[result.campaign.scenes.length - 1]
      setNewSceneName('')
      setNewSceneDescription('')
      setIsSceneComposerOpen(false)
      setSceneActionStatus(`Сцена "${createdScene.name}" создана и сохранена.`)
      return
    }

    setSceneActionStatus('Не удалось создать сцену.')
  }

  async function handleActivateScene(sceneId: string): Promise<void> {
    const result = await activateScene(sceneId)

    if (result.ok) {
      const scene = result.campaign.scenes.find((candidate) => candidate.id === sceneId)
      setSceneActionStatus(`Сцена "${scene?.name ?? 'без названия'}" выбрана активной.`)
      return
    }

    setSceneActionStatus('Не удалось выбрать сцену.')
  }

  async function handleSendActiveSceneToPlayers(): Promise<void> {
    const result = await sendActiveSceneToPlayers()

    if (result.ok) {
      const sceneName = result.campaign.playerScreenState.scenePreview?.name ?? 'активная сцена'
      setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      setSceneActionStatus(`Сцена "${sceneName}" отправлена игрокам.`)
      setPlayerActionStatus(`Сцена "${sceneName}" отправлена игрокам.`)
      return
    }

    setSceneActionStatus('Не удалось отправить активную сцену игрокам.')
  }

  async function handleClearPlayerScreen(): Promise<void> {
    const result = await clearPlayerScreen()

    if (result.ok) {
      setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      setPlayerActionStatus('Экран игроков очищен.')
      return
    }

    setPlayerActionStatus('Не удалось очистить экран игроков.')
  }

  async function handleUpdateActiveSceneGrid(grid: Partial<SceneGrid>): Promise<void> {
    const result = await updateActiveSceneGrid(grid)

    setSceneActionStatus(result.ok ? 'Настройки сетки сохранены.' : 'Не удалось сохранить настройки сетки.')
  }

  async function handleUpdateActiveSceneViewport(viewport: Partial<SceneCanvasViewport>): Promise<void> {
    const result = await updateActiveSceneViewport(viewport)

    setSceneActionStatus(result.ok ? 'Положение canvas сохранено.' : 'Не удалось сохранить положение canvas.')
  }

  async function handleUpdatePlayerSceneViewport(viewport: Partial<SceneCanvasViewport>): Promise<void> {
    const result = await updatePlayerSceneViewport(viewport)

    setPlayerActionStatus(result.ok ? 'Вид экрана игроков сохранён.' : 'Не удалось сохранить вид экрана игроков.')
  }

  async function handleAddActiveSceneMeasurement(input: SceneMeasurementInput): Promise<void> {
    const result = await addActiveSceneMeasurement(input)

    setSceneActionStatus(result.ok ? 'Измерение добавлено.' : 'Не удалось добавить измерение.')
  }

  async function handleClearActiveSceneMeasurements(): Promise<void> {
    const result = await clearActiveSceneMeasurements()

    setSceneActionStatus(result.ok ? 'Измерения очищены.' : 'Не удалось очистить измерения.')
  }

  async function handleUpdateActiveSceneFog(
    fog: Partial<Pick<SceneCanvasFogState, 'enabled' | 'opacity'>>,
  ): Promise<void> {
    const result = await updateActiveSceneFog(fog)

    setSceneActionStatus(result.ok ? 'Туман войны сохранен.' : 'Не удалось сохранить туман войны.')
  }

  async function handleAddActiveSceneFogRegion(input: SceneFogRegionInput): Promise<void> {
    const result = await addActiveSceneFogRegion(input)

    setSceneActionStatus(result.ok ? 'Область тумана закрыта.' : 'Не удалось добавить область тумана.')
  }

  async function handleUpdateActiveSceneFogRegion(
    regionId: SceneCanvasFogRegionId,
    regionUpdate: SceneFogRegionUpdate,
  ): Promise<void> {
    const result = await updateActiveSceneFogRegion(regionId, regionUpdate)

    setSceneActionStatus(result.ok ? 'Область тумана изменена.' : 'Не удалось изменить область тумана.')
  }

  async function handleRemoveLastActiveSceneFogRegion(): Promise<void> {
    const result = await removeLastActiveSceneFogRegion()

    setSceneActionStatus(result.ok ? 'Последняя область тумана открыта.' : 'Не удалось открыть область тумана.')
  }

  async function handleClearActiveSceneFogRegions(): Promise<void> {
    const result = await clearActiveSceneFogRegions()

    setSceneActionStatus(result.ok ? 'Туман войны очищен.' : 'Не удалось очистить туман войны.')
  }

  async function handleMoveActiveSceneObject(
    objectId: SceneCanvasObjectId,
    direction: SceneObjectMoveDirection,
  ): Promise<void> {
    const result = await moveActiveSceneObject(objectId, direction)

    if (result.ok) {
      setSelectedSceneObjectId(objectId)
    }

    setSceneActionStatus(result.ok ? 'Объект сцены перемещен.' : 'Не удалось переместить объект сцены.')
  }

  async function handlePositionActiveSceneObject(
    objectId: SceneCanvasObjectId,
    position: SceneCanvasObjectPosition,
  ): Promise<void> {
    const result = await positionActiveSceneObject(objectId, position)

    if (result.ok) {
      setSelectedSceneObjectId(objectId)
    }

    setSceneActionStatus(result.ok ? 'Объект сцены перемещен.' : 'Не удалось переместить объект сцены.')
  }

  async function handleDuplicateActiveSceneObject(objectId: SceneCanvasObjectId): Promise<void> {
    const result = await duplicateActiveSceneObject(objectId)

    if (result.ok) {
      const activeScene = getActiveSceneFromCampaign(result.campaign)
      const duplicatedObject = activeScene ? getSceneCanvasState(activeScene).objects.at(-1) : undefined

      if (duplicatedObject) {
        setSelectedSceneObjectId(duplicatedObject.id)
      }
    }

    setSceneActionStatus(result.ok ? 'Объект сцены дублирован.' : 'Не удалось дублировать объект сцены.')
  }

  async function handleSetActiveSceneObjectVisibility(
    objectId: SceneCanvasObjectId,
    isPlayerVisible: boolean,
  ): Promise<void> {
    const result = await setActiveSceneObjectVisibility(objectId, isPlayerVisible)

    if (result.ok) {
      setSelectedSceneObjectId(objectId)
    }

    setSceneActionStatus(
      result.ok
        ? isPlayerVisible
          ? 'Объект сцены виден игрокам.'
          : 'Объект сцены скрыт от игроков.'
        : 'Не удалось изменить видимость объекта сцены.',
    )
  }

  async function handleUpdateActiveSceneObjectTokenState(
    objectId: SceneCanvasObjectId,
    tokenState: SceneCanvasObjectTokenState,
  ): Promise<void> {
    const result = await updateActiveSceneObjectTokenState(objectId, tokenState)

    if (result.ok) {
      setSelectedSceneObjectId(objectId)
    }

    setSceneActionStatus(result.ok ? 'Карточка токена сохранена.' : 'Не удалось обновить карточку токена.')
  }

  async function handleImportImageAsset(): Promise<void> {
    const result = await importImageAsset(
      assetKind,
      assetName,
      normalizeAssetTags(assetImportTags),
      activeUserLayer,
    )

    if (result.ok) {
      const asset = result.campaign.assets.find((candidate) => candidate.id === result.assetId)
      setAssetName('')
      setAssetImportTags('')
      setAssetActionStatus(`Изображение "${asset?.name ?? 'без названия'}" импортировано.`)

      if (asset?.kind === 'map' && activeUserLayer === 'map') {
        setSceneActionStatus(`Карта "${asset.name}" привязана к активной сцене.`)
      }

      return
    }

    setAssetActionStatus(result.reason === 'cancelled' ? 'Импорт изображения отменен.' : 'Не удалось импортировать изображение.')
  }

  async function handleUpdateAssetTags(assetId: AssetId): Promise<void> {
    const result = await updateAssetTags(assetId, assetTagDrafts[assetId] ?? '')

    if (result.ok) {
      const asset = result.campaign.assets.find((candidate) => candidate.id === assetId)
      setAssetActionStatus(`Теги ассета "${asset?.name ?? 'без названия'}" сохранены.`)
      return
    }

    setAssetActionStatus('Не удалось сохранить теги ассета.')
  }

  async function handleUseAssetInActiveScene(assetId: AssetId): Promise<void> {
    const result = await applyAssetToActiveScene(assetId, activeUserLayer)

    if (result.ok) {
      const asset = result.campaign.assets.find((candidate) => candidate.id === assetId)
      const assetName = asset?.name ?? 'ассет'

      if (asset?.kind === 'map' && activeUserLayer === 'map') {
        setSceneActionStatus(`Карта "${assetName}" привязана к активной сцене.`)
        setAssetActionStatus(`Карта "${assetName}" используется как фон сцены.`)
        return
      }

      const userLayerLabel = getSceneUserLayerLabel(activeUserLayer)
      setSceneActionStatus(`Ассет "${assetName}" добавлен на слой «${userLayerLabel}».`)
      setAssetActionStatus(`Ассет "${assetName}" добавлен на слой «${userLayerLabel}».`)
      const updatedActiveScene = getActiveSceneFromCampaign(result.campaign)
      const addedObject = updatedActiveScene ? getSceneCanvasState(updatedActiveScene).objects.at(-1) : undefined

      if (addedObject) {
        setSelectedSceneObjectId(addedObject.id)
      }
      return
    }

    setAssetActionStatus('Не удалось добавить ассет в активную сцену.')
  }

  async function handleSendAssetToPlayers(assetId: AssetId): Promise<void> {
    const result = await sendAssetToPlayers(assetId)

    if (result.ok) {
      const assetName = result.campaign.playerScreenState.handoutPreview?.name ?? 'изображение'
      setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      setAssetActionStatus(`Изображение "${assetName}" отправлено игрокам.`)
      setPlayerActionStatus(`Изображение "${assetName}" отправлено игрокам.`)
      return
    }

    setAssetActionStatus('Не удалось отправить изображение игрокам.')
  }

  async function handleCreateCharacterCard(): Promise<void> {
    const result = await createCharacterCard(createCharacterCardInput(characterDraft))

    if (result.ok) {
      const createdCard = result.campaign.characterCards.find((card) => card.id === result.characterCardId)
      setSelectedCharacterCardId(result.characterCardId)
      setCharacterDraft(createdCard ? createCharacterCardDraft(createdCard) : emptyCharacterCardDraft)
      setCharacterActionStatus(`Карточка "${createdCard?.name ?? 'без названия'}" создана.`)
      setActiveRightPanel('characters')
      return
    }

    setCharacterActionStatus('Не удалось создать карточку.')
  }

  async function handleUpdateCharacterCard(): Promise<void> {
    if (selectedCharacterCardId === null) {
      setCharacterActionStatus('Выберите карточку для редактирования.')
      return
    }

    const result = await updateCharacterCard(selectedCharacterCardId, createCharacterCardInput(characterDraft))

    if (result.ok) {
      const updatedCard = result.campaign.characterCards.find((card) => card.id === selectedCharacterCardId)
      setCharacterDraft(updatedCard ? createCharacterCardDraft(updatedCard) : characterDraft)
      setCharacterActionStatus(`Карточка "${updatedCard?.name ?? 'без названия'}" сохранена.`)
      return
    }

    setCharacterActionStatus('Не удалось сохранить карточку.')
  }

  async function handleDeleteCharacterCard(): Promise<void> {
    if (selectedCharacterCardId === null) {
      setCharacterActionStatus('Выберите карточку для удаления.')
      return
    }

    const cardName = selectedCharacterCard?.name ?? 'карточка'
    const result = await deleteCharacterCard(selectedCharacterCardId)

    if (result.ok) {
      setSelectedCharacterCardId(null)
      setCharacterDraft(emptyCharacterCardDraft)
      setCharacterActionStatus(`Карточка "${cardName}" удалена.`)
      return
    }

    setCharacterActionStatus('Не удалось удалить карточку.')
  }

  function handleSelectCharacterCard(card: CharacterCard): void {
    setSelectedCharacterCardId(card.id)
    setCharacterDraft(createCharacterCardDraft(card))
    setCharacterActionStatus(`Карточка "${card.name}" выбрана.`)
  }

  function handleNewCharacterCardDraft(): void {
    setSelectedCharacterCardId(null)
    setCharacterDraft(emptyCharacterCardDraft)
    setCharacterActionStatus('Новая карточка готова к заполнению.')
  }

  async function handleCreateNote(): Promise<void> {
    const result = await createNote(createNoteInput(noteDraft))

    if (result.ok) {
      const createdNote = result.campaign.notes.find((note) => note.id === result.noteId)
      setSelectedNoteId(result.noteId)
      setNoteDraft(createdNote ? createNoteDraft(createdNote) : emptyNoteDraft)
      setNoteActionStatus(`Заметка "${createdNote?.title ?? 'без названия'}" создана.`)
      setActiveRightPanel('notes')
      return
    }

    setNoteActionStatus('Не удалось создать заметку.')
  }

  async function handleUpdateNote(): Promise<void> {
    if (selectedNoteId === null) {
      setNoteActionStatus('Выберите заметку для сохранения.')
      return
    }

    const result = await updateNote(selectedNoteId, createNoteInput(noteDraft))

    if (result.ok) {
      const updatedNote = result.campaign.notes.find((note) => note.id === selectedNoteId)
      setNoteDraft(updatedNote ? createNoteDraft(updatedNote) : noteDraft)
      setNoteActionStatus(`Заметка "${updatedNote?.title ?? 'без названия'}" сохранена.`)
      return
    }

    setNoteActionStatus('Не удалось сохранить заметку.')
  }

  async function handleDeleteNote(): Promise<void> {
    if (selectedNoteId === null) {
      setNoteActionStatus('Выберите заметку для удаления.')
      return
    }

    const noteTitle = selectedNote?.title ?? 'заметка'
    const result = await deleteNote(selectedNoteId)

    if (result.ok) {
      setSelectedNoteId(null)
      setNoteDraft(emptyNoteDraft)
      setNoteActionStatus(`Заметка "${noteTitle}" удалена.`)
      return
    }

    setNoteActionStatus('Не удалось удалить заметку.')
  }

  function handleSelectNote(note: Note): void {
    setSelectedNoteId(note.id)
    setNoteDraft(createNoteDraft(note))
    setNoteActionStatus(`Заметка "${note.title}" выбрана.`)
  }

  function handleNewNoteDraft(): void {
    setSelectedNoteId(null)
    setNoteDraft(emptyNoteDraft)
    setNoteActionStatus('Новая заметка готова к заполнению.')
  }

  async function handleSendNoteToPlayers(noteId: NoteId): Promise<void> {
    const note = notes.find((candidate) => candidate.id === noteId)

    if (!note) {
      setNoteActionStatus('Заметка не найдена.')
      return
    }

    if (note.scope === 'master') {
      setNoteActionStatus('Секретная заметка не отправляется игрокам.')
      return
    }

    const result = await sendNoteToPlayers(noteId)

    if (result.ok) {
      const handoutName = result.campaign.playerScreenState.handoutPreview?.name ?? note.title
      setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      setNoteActionStatus(`Handout "${handoutName}" показан игрокам.`)
      setPlayerActionStatus(`Handout "${handoutName}" показан игрокам.`)
      return
    }

    setNoteActionStatus('Не удалось показать handout игрокам.')
  }

  async function handleHidePlayerHandout(): Promise<void> {
    const result = await hidePlayerHandout()

    if (result.ok) {
      setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      setNoteActionStatus('Handout скрыт у игроков.')
      setPlayerActionStatus('Handout скрыт у игроков.')
      return
    }

    setNoteActionStatus('Не удалось скрыть handout у игроков.')
  }

  async function handleCreateCombatParticipant(): Promise<void> {
    const result = await createCombatParticipant(createCombatParticipantInput(combatDraft))

    if (result.ok) {
      const participant = result.participantId
        ? result.campaign.combatState.participants.find((candidate) => candidate.id === result.participantId)
        : null

      if (result.playerStatus) {
        setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      }

      setSelectedCombatParticipantId(result.participantId ?? null)
      setCombatDraft(participant ? createCombatParticipantDraft(participant) : emptyCombatParticipantDraft)
      setCombatActionStatus(`Участник "${participant?.name ?? 'без названия'}" добавлен в инициативу.`)
      return
    }

    setCombatActionStatus('Не удалось добавить участника инициативы.')
  }

  async function handleUpdateCombatParticipant(): Promise<void> {
    if (selectedCombatParticipantId === null) {
      setCombatActionStatus('Выберите участника для сохранения.')
      return
    }

    const result = await updateCombatParticipant(
      selectedCombatParticipantId,
      createCombatParticipantInput(combatDraft),
    )

    if (result.ok) {
      const participant = result.campaign.combatState.participants.find(
        (candidate) => candidate.id === selectedCombatParticipantId,
      )

      if (result.playerStatus) {
        setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      }

      setCombatDraft(participant ? createCombatParticipantDraft(participant) : combatDraft)
      setCombatActionStatus(`Участник "${participant?.name ?? 'без названия'}" сохранен.`)
      return
    }

    setCombatActionStatus('Не удалось сохранить участника инициативы.')
  }

  async function handleDeleteCombatParticipant(): Promise<void> {
    if (selectedCombatParticipantId === null) {
      setCombatActionStatus('Выберите участника для удаления.')
      return
    }

    const participantName = selectedCombatParticipant?.name ?? 'участник'
    const result = await deleteCombatParticipant(selectedCombatParticipantId)

    if (result.ok) {
      if (result.playerStatus) {
        setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      }

      setSelectedCombatParticipantId(null)
      setCombatDraft(emptyCombatParticipantDraft)
      setCombatActionStatus(`Участник "${participantName}" удален из инициативы.`)
      return
    }

    setCombatActionStatus('Не удалось удалить участника инициативы.')
  }

  function handleSelectCombatParticipant(participant: CombatParticipant): void {
    setSelectedCombatParticipantId(participant.id)
    setCombatDraft(createCombatParticipantDraft(participant))
    setCombatActionStatus(`Участник "${participant.name}" выбран.`)
  }

  function handleNewCombatParticipantDraft(): void {
    setSelectedCombatParticipantId(null)
    setCombatDraft(emptyCombatParticipantDraft)
    setCombatActionStatus('Новый участник готов к заполнению.')
  }

  async function handleStartCombat(): Promise<void> {
    const result = await startCombat()

    if (result.ok) {
      if (result.playerStatus) {
        setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      }

      const activeParticipant = getActiveCombatParticipantLabel(result.campaign.combatState.participants, result.campaign.combatState.turnIndex)
      setCombatActionStatus(`Инициатива начата. Текущий ход: ${activeParticipant}.`)
      return
    }

    setCombatActionStatus('Не удалось начать инициативу.')
  }

  async function handleStopCombat(): Promise<void> {
    const result = await stopCombat()

    if (result.ok) {
      if (result.playerStatus) {
        setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      }

      setCombatActionStatus('Инициатива остановлена.')
      return
    }

    setCombatActionStatus('Не удалось остановить инициативу.')
  }

  async function handleAdvanceCombatTurn(): Promise<void> {
    const result = await advanceCombatTurn()

    if (result.ok) {
      if (result.playerStatus) {
        setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      }

      const activeParticipant = getActiveCombatParticipantLabel(result.campaign.combatState.participants, result.campaign.combatState.turnIndex)
      setCombatActionStatus(`Следующий ход: ${activeParticipant}. Раунд ${result.campaign.combatState.round}.`)
      return
    }

    setCombatActionStatus('Не удалось перейти к следующему ходу.')
  }

  async function handleAdvanceCombatRound(): Promise<void> {
    const result = await advanceCombatRound()

    if (result.ok) {
      if (result.playerStatus) {
        setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      }

      setCombatActionStatus(`Раунд ${result.campaign.combatState.round} начат.`)
      return
    }

    setCombatActionStatus('Не удалось перейти к следующему раунду.')
  }

  async function handleSetPlayerInitiativeVisible(isVisible: boolean): Promise<void> {
    const result = await setPlayerInitiativeVisible(isVisible)

    if (result.ok) {
      if (result.playerStatus) {
        setPlayerStatus(getStatusFromPlayerAction(result.playerStatus))
      }

      setCombatActionStatus(isVisible ? 'Инициатива показана игрокам.' : 'Инициатива скрыта от игроков.')
      setPlayerActionStatus(isVisible ? 'Инициатива показана игрокам.' : 'Инициатива скрыта от игроков.')
      return
    }

    setCombatActionStatus('Не удалось обновить видимость инициативы.')
  }

  async function runPlayerAction(label: string, action: () => Promise<PlayerActionResult>): Promise<void> {
    setPlayerActionStatus('Выполняется...')

    try {
      const result = await action()
      setPlayerStatus(getStatusFromPlayerAction(result))
      setPlayerActionStatus(getPlayerActionLabel(label, result))
    } catch {
      setPlayerActionStatus('Не удалось выполнить действие.')
    }
  }

  function handleSelectWorkspaceSection(section: WorkspaceSection): void {
    const shouldReturnFocusToSceneNavigation = section === 'scenes' && activeWorkspaceSection !== 'scenes'
    setActiveWorkspaceSection(section)

    if (section === 'notes') {
      setActiveRightPanel('notes')
    }

    window.dispatchEvent(new CustomEvent(WORKSPACE_NAVIGATION_EVENT, { detail: { section } }))

    if (shouldReturnFocusToSceneNavigation) {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>('[data-nav-section="scenes"]')?.focus()
      })
    }
  }

  const rightPanelContentProps: RightPanelContentProps = {
    activeUserLayer,
    activeRightPanel,
    assetActionStatus,
    assetImportTags,
    assetKind,
    assetKindFilter,
    assetName,
    assetSearchQuery,
    assetSelectedTags,
    assetTagDrafts,
    assets: selectedCampaign?.assets ?? [],
    canEditCharacters: selectedCampaign !== null,
    canEditNotes: selectedCampaign !== null,
    canImportAssets: selectedCampaign !== null,
    canUseAssetsInScene: selectedCampaign !== null && activeScene !== null,
    characterActionStatus,
    characterCards,
    characterDraft,
    activePlayerHandoutId,
    isStorageBusy,
    isPlayerHandoutVisible,
    noteActionStatus,
    noteDraft,
    notes,
    onAssetImportTagsChange: setAssetImportTags,
    onAssetKindChange: setAssetKind,
    onAssetKindFilterChange: setAssetKindFilter,
    onAssetNameChange: setAssetName,
    onAssetSearchQueryChange: setAssetSearchQuery,
    onAssetTagDraftChange: (assetId, value) =>
      setAssetTagDrafts((drafts) => ({
        ...drafts,
        [assetId]: value,
      })),
    onAssetTagToggle: setAssetSelectedTags,
    onImportImageAsset: handleImportImageAsset,
    onSendAssetToPlayers: handleSendAssetToPlayers,
    onUpdateAssetTags: handleUpdateAssetTags,
    onUseAssetInActiveScene: handleUseAssetInActiveScene,
    onCharacterDraftChange: (patch) =>
      setCharacterDraft((draft) => ({
        ...draft,
        ...patch,
      })),
    onCreateCharacterCard: handleCreateCharacterCard,
    onDeleteCharacterCard: handleDeleteCharacterCard,
    onNewCharacterCardDraft: handleNewCharacterCardDraft,
    onSelectCharacterCard: handleSelectCharacterCard,
    onUpdateCharacterCard: handleUpdateCharacterCard,
    onCreateNote: handleCreateNote,
    onDeleteNote: handleDeleteNote,
    onHidePlayerHandout: handleHidePlayerHandout,
    onNewNoteDraft: handleNewNoteDraft,
    onNoteDraftChange: (patch) =>
      setNoteDraft((draft) => ({
        ...draft,
        ...patch,
      })),
    onSelectNote: handleSelectNote,
    onSendNoteToPlayers: handleSendNoteToPlayers,
    onUpdateNote: handleUpdateNote,
    portraitAssets,
    selectedCharacterCardId,
    selectedNoteId,
  }

  return (
    <div className="workspace-studio" aria-label="Редактор сцены">
      <header className="workspace-studio__header">
        <div className="workspace-studio__identity">
          <span className="workspace-studio__kicker">Открытый проект</span>
          <strong>{selectedCampaign?.name ?? 'Проект не выбран'}</strong>
          <span>{activeScene?.name ?? 'Создайте первую сцену'}</span>
        </div>
        <div className="workspace-studio__save" aria-live="polite">
          <span className={`save-state-dot save-state-dot--${saveState.status}`} aria-hidden="true" />
          <div>
            <strong>{saveStatusLabel}</strong>
            <span>{lastError ?? campaignActionStatus}</span>
          </div>
        </div>
        <div className="workspace-studio__actions">
          <button
            aria-label="Отменить последнее действие"
            className="button button--secondary workspace-studio__icon-button"
            disabled={historyState.undoCount === 0 || isStorageBusy}
            onClick={() => void handleUndoCampaign()}
            title="Отменить (Ctrl+Z)"
            type="button"
          >
            ↶
          </button>
          <button
            aria-label="Повторить отменённое действие"
            className="button button--secondary workspace-studio__icon-button"
            disabled={historyState.redoCount === 0 || isStorageBusy}
            onClick={() => void handleRedoCampaign()}
            title="Повторить (Ctrl+Y)"
            type="button"
          >
            ↷
          </button>
          <button
            className="button button--secondary workspace-studio__save-button"
            disabled={selectedCampaign === null || isStorageBusy}
            onClick={() => void handleSaveCampaign()}
            title={saveStatusDetail}
            type="button"
          >
            {isStorageBusy ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </header>

      <WorkspaceSectionPanel
        activeSection={activeWorkspaceSection}
        badge={selectedCampaign ? `${selectedCampaign.assets.length} выбрано` : 'общая'}
        id="assets"
        onSelect={handleSelectWorkspaceSection}
        summary="Индексируемая библиотека изображений"
        title="Ассеты"
      >
        <AssetManagerPanel
          campaign={selectedCampaign}
          isCampaignBusy={isStorageBusy}
          onSelectAsset={selectIndexedAsset}
        />
      </WorkspaceSectionPanel>

      <WorkspaceSectionPanel
        activeSection={activeWorkspaceSection}
        badge={selectedCampaign ? `${selectedCampaign.scenes.length} сцен` : 'нет кампании'}
        id="scenes"
        onSelect={handleSelectWorkspaceSection}
        summary={activeScene?.name ?? 'Сцена не выбрана'}
        title="Сцены"
      >
        <div className="scenes-panel">
          <section className="scene-strip" id="section-scenes" aria-label="Сцены">
            <div className="scene-strip__header">
              <div>
                <strong>Сцены</strong>
                <span className="muted">
                  {selectedCampaign ? `${selectedCampaign.scenes.length} в проекте` : 'Откройте проект'}
                </span>
              </div>
              <button
                aria-expanded={isSceneComposerOpen}
                className="button button--secondary scene-strip__create-toggle"
                disabled={selectedCampaign === null || isStorageBusy}
                onClick={() => setIsSceneComposerOpen((isOpen) => !isOpen)}
                type="button"
              >
                {isSceneComposerOpen ? 'Скрыть форму' : '+ Новая сцена'}
              </button>
            </div>
            {isSceneComposerOpen ? (
              <form
                className="scene-strip__actions"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleCreateScene()
                }}
              >
                <input
                  autoFocus
                  disabled={selectedCampaign === null || isStorageBusy}
                  onChange={(event) => setNewSceneName(event.target.value)}
                  placeholder="Например: Ритуальный зал"
                  value={newSceneName}
                />
                <input
                  disabled={selectedCampaign === null || isStorageBusy}
                  onChange={(event) => setNewSceneDescription(event.target.value)}
                  placeholder="Короткое описание сцены"
                  value={newSceneDescription}
                />
                <button className="button" disabled={selectedCampaign === null || isStorageBusy} type="submit">
                  Создать сцену
                </button>
              </form>
            ) : null}
            <div className="scene-strip__items">
              {selectedCampaign === null ? (
                <p className="scene-strip__empty">Создайте или откройте кампанию, чтобы добавить сцены.</p>
              ) : selectedCampaign.scenes.length === 0 ? (
                <p className="scene-strip__empty">Сцен пока нет. Первая созданная сцена станет активной.</p>
              ) : (
                selectedCampaign.scenes.map((scene) => (
                  <button
                    className={scene.isActive ? 'scene-tab scene-tab--active' : 'scene-tab'}
                    disabled={isStorageBusy}
                    key={scene.id}
                    onClick={() => void handleActivateScene(scene.id)}
                    title={scene.description ?? 'Без описания'}
                    type="button"
                  >
                    <span>{scene.name}</span>
                    <small>{scene.description ?? 'Без описания'}</small>
                    <span className="scene-tab__status">{scene.isActive ? 'активна' : 'черновик'}</span>
                  </button>
                ))
              )}
            </div>
            <p className="scene-strip__status">{sceneActionStatus}</p>
          </section>

          <div className={isMaterialsPanelOpen ? 'scene-workbench' : 'scene-workbench scene-workbench--wide'}>
            <aside className="tool-rail" aria-label="Горячие клавиши">
              <button
                aria-controls="tool-rail-popover"
                aria-expanded={isToolRailOpen}
                aria-label="Показать горячие клавиши"
                className="button button--secondary icon-button tool-rail__trigger"
                onClick={() => setIsToolRailOpen((isOpen) => !isOpen)}
                title="Горячие клавиши"
                type="button"
              >
                ?
              </button>
              {isToolRailOpen ? (
                <div className="tool-rail__popover" id="tool-rail-popover">
                  <div className="tool-rail__header">
                    <h2>Хоткеи</h2>
                  </div>
                  <div className="tool-shortcuts">
                    {toolGroups.map((group) => (
                      <section className="tool-shortcut-group" key={group.title}>
                        <h3>{group.title}</h3>
                        <ul>
                          {group.items.map((tool) => (
                            <li key={tool.label} title={`${tool.label}: ${tool.description}`}>
                              <span className="tool-shortcut__icon" aria-hidden="true">
                                {tool.icon}
                              </span>
                              <span className="tool-shortcut__copy">
                                <strong>{tool.label}</strong>
                                <small>{tool.description}</small>
                              </span>
                              <kbd>{tool.shortcut}</kbd>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>

            <main className="master-workspace-panel" aria-label="Рабочая область сцены">
              <section className="workspace-board">
                <div className="workspace-board__toolbar">
                  <div>
                    <p className="eyebrow">Scene Workspace</p>
                    <h2>{activeScene?.name ?? 'Рабочая область сцены'}</h2>
                  </div>
                  <div className="workspace-board__meta">
                    <button
                      aria-expanded={isMaterialsPanelOpen}
                      className="workspace-board__materials-toggle"
                      onClick={() => setIsMaterialsPanelOpen((isOpen) => !isOpen)}
                      type="button"
                    >
                      {isMaterialsPanelOpen ? 'Скрыть материалы' : 'Материалы'}
                    </button>
                    <span>Туман войны</span>
                    <span>Handouts</span>
                    <span>Инициатива</span>
                    <span>Экран игроков: {getPlayerModeLabel(playerStatus.state.mode)}</span>
                  </div>
                </div>

                <SceneCanvas
                  activeUserLayer={activeUserLayer}
                  assets={selectedCampaign?.assets ?? []}
                  characterCards={characterCards}
                  isPlayerSynced={Boolean(activeScene && playerStatus.state.activeSceneId === activeScene.id)}
                  isStorageBusy={isStorageBusy}
                  mapAsset={activeMapAsset}
                  playerViewport={selectedCampaign?.playerScreenState.playerViewport}
                  onActiveUserLayerChange={(userLayer) => {
                    setActiveUserLayer(userLayer)
                    setSceneActionStatus(`Активен слой «${getSceneUserLayerLabel(userLayer)}».`)
                  }}
                  onAddMeasurement={(template) => void handleAddActiveSceneMeasurement(template)}
                  onClearMeasurements={() => void handleClearActiveSceneMeasurements()}
                  onAddFogRegion={(shape) => void handleAddActiveSceneFogRegion(shape)}
                  onClearFogRegions={() => void handleClearActiveSceneFogRegions()}
                  onDuplicateObject={(objectId) => void handleDuplicateActiveSceneObject(objectId)}
                  onMoveObject={(objectId, direction) => void handleMoveActiveSceneObject(objectId, direction)}
                  onMoveObjectTo={(objectId, position) => void handlePositionActiveSceneObject(objectId, position)}
                  onRemoveLastFogRegion={() => void handleRemoveLastActiveSceneFogRegion()}
                  onSelectObject={setSelectedSceneObjectId}
                  onSendToPlayers={() => void handleSendActiveSceneToPlayers()}
                  onSetObjectVisibility={(objectId, isPlayerVisible) =>
                    void handleSetActiveSceneObjectVisibility(objectId, isPlayerVisible)
                  }
                  onUpdateObjectTokenState={(objectId, tokenState) =>
                    void handleUpdateActiveSceneObjectTokenState(objectId, tokenState)
                  }
                  onUpdateFog={(fog) => void handleUpdateActiveSceneFog(fog)}
                  onUpdateFogRegion={(regionId, regionUpdate) =>
                    void handleUpdateActiveSceneFogRegion(regionId, regionUpdate)
                  }
                  onUpdateGrid={(grid) => void handleUpdateActiveSceneGrid(grid)}
                  onUpdatePlayerViewport={(viewport) => void handleUpdatePlayerSceneViewport(viewport)}
                  onUpdateViewport={(viewport) => void handleUpdateActiveSceneViewport(viewport)}
                  scene={activeScene}
                  selectedObjectId={selectedSceneObjectId}
                />
              </section>
            </main>

            {isMaterialsPanelOpen ? (
              <aside className="context-panel" id="section-library" aria-label="Материалы">
                <div className="context-panel__header">
                  <div>
                    <p className="eyebrow">Library</p>
                    <h2>Материалы</h2>
                  </div>
                </div>
                <div className="tab-list" role="tablist" aria-label="Материалы мастера">
                  {rightPanelTabs.map((tab) => (
                    <button
                      aria-selected={activeRightPanel === tab.id}
                      className={activeRightPanel === tab.id ? 'tab-button tab-button--active' : 'tab-button'}
                      key={tab.id}
                      onClick={() => setActiveRightPanel(tab.id)}
                      role="tab"
                      type="button"
                    >
                      <span>{tab.label}</span>
                      <small>{tab.count}</small>
                    </button>
                  ))}
                </div>
                {renderRightPanelContent(rightPanelContentProps)}
              </aside>
            ) : null}
          </div>
        </div>
      </WorkspaceSectionPanel>

      <WorkspaceSectionPanel
        activeSection={activeWorkspaceSection}
        badge={selectedCampaign?.combatState.isActive ? `Раунд ${selectedCampaign.combatState.round}` : 'ожидание'}
        id="combat"
        onSelect={handleSelectWorkspaceSection}
        summary={activeCombatParticipant ? `Ход: ${activeCombatParticipant.name}` : `${combatParticipants.length} участников`}
        title="Бой"
      >
        <div className="workspace-section__scroll">
          <CombatTrackerPanel
            activeParticipant={activeCombatParticipant}
            canEditCombat={selectedCampaign !== null}
            combatActionStatus={combatActionStatus}
            combatDraft={combatDraft}
            combatParticipants={combatParticipants}
            combatState={selectedCampaign?.combatState ?? null}
            isPlayerInitiativeVisible={selectedCampaign?.playerScreenState.initiativeVisible ?? false}
            isStorageBusy={isStorageBusy}
            onAdvanceRound={handleAdvanceCombatRound}
            onAdvanceTurn={handleAdvanceCombatTurn}
            onCombatDraftChange={(patch) =>
              setCombatDraft((draft) => ({
                ...draft,
                ...patch,
              }))
            }
            onCreateParticipant={handleCreateCombatParticipant}
            onDeleteParticipant={handleDeleteCombatParticipant}
            onNewParticipantDraft={handleNewCombatParticipantDraft}
            onSelectParticipant={handleSelectCombatParticipant}
            onSetPlayerInitiativeVisible={handleSetPlayerInitiativeVisible}
            onStartCombat={handleStartCombat}
            onStopCombat={handleStopCombat}
            onUpdateParticipant={handleUpdateCombatParticipant}
            selectedParticipantId={selectedCombatParticipantId}
          />
        </div>
      </WorkspaceSectionPanel>

      <WorkspaceSectionPanel
        activeSection={activeWorkspaceSection}
        badge={`${notes.length} заметок`}
        id="notes"
        onSelect={handleSelectWorkspaceSection}
        summary={selectedNote?.title ?? 'Заметка не выбрана'}
        title="Заметки"
      >
        <aside className="context-panel context-panel--standalone" id="section-notes" aria-label="Заметки">
          <div className="context-panel__header">
            <div>
              <p className="eyebrow">Notes</p>
              <h2>Заметки</h2>
            </div>
          </div>
          {renderRightPanelContent({
            ...rightPanelContentProps,
            activeRightPanel: 'notes',
          })}
        </aside>
      </WorkspaceSectionPanel>

      <WorkspaceSectionPanel
        activeSection={activeWorkspaceSection}
        badge={playerStatus.isOpen ? 'открыт' : 'закрыт'}
        id="players"
        onSelect={handleSelectWorkspaceSection}
        summary={`Режим: ${getPlayerModeLabel(playerStatus.state.mode)}`}
        title="Экран игроков"
      >
        <div className="workspace-section__scroll">
          <PlayerScreenControls
            activeScene={activeScene}
            isStorageBusy={isStorageBusy}
            onClear={handleClearPlayerScreen}
            onPublishActiveScene={handleSendActiveSceneToPlayers}
            playerActionStatus={playerActionStatus}
            playerStatus={playerStatus}
            runPlayerAction={runPlayerAction}
          />
        </div>
      </WorkspaceSectionPanel>
    </div>
  )
}

interface WorkspaceSectionPanelProps {
  activeSection: WorkspaceSection
  badge: string
  children: ReactNode
  id: WorkspaceSection
  onSelect(section: WorkspaceSection): void
  summary: string
  title: string
}

function WorkspaceSectionPanel({
  activeSection,
  badge,
  children,
  id,
  onSelect,
  summary,
  title,
}: WorkspaceSectionPanelProps) {
  const isActive = activeSection === id
  const isStage = id === 'scenes'
  const contentId = `workspace-section-content-${id}`
  const className = isStage
    ? 'workspace-section workspace-section--stage'
    : isActive
      ? 'workspace-section workspace-section--utility workspace-section--active'
      : 'workspace-section workspace-section--utility'

  return (
    <section
      aria-hidden={!isStage && !isActive}
      className={className}
      data-workspace-section={id}
      id={`workspace-section-${id}`}
    >
      {!isStage ? (
        <button
          aria-controls={contentId}
          aria-expanded={isActive}
          aria-label={`Закрыть панель «${title}»`}
          className="workspace-section__toggle"
          onClick={() => onSelect('scenes')}
          type="button"
        >
          <span className="workspace-section__title">{title}</span>
          <span className="workspace-section__summary">{summary}</span>
          <span className="workspace-section__badge">{badge}</span>
          <span className="workspace-section__chevron" aria-hidden="true">×</span>
        </button>
      ) : null}
      {isStage || isActive ? (
        <div
          className="workspace-section__content"
          data-workspace-section-content={id}
          id={contentId}
        >
          {children}
        </div>
      ) : null}
    </section>
  )
}

interface PlayerScreenControlsProps {
  activeScene: Scene | null
  isStorageBusy: boolean
  onClear(): Promise<void>
  onPublishActiveScene(): Promise<void>
  playerActionStatus: string
  playerStatus: PlayerScreenStatus
  runPlayerAction(label: string, action: () => Promise<PlayerActionResult>): Promise<void>
}

interface CombatTrackerPanelProps {
  activeParticipant: CombatParticipant | null
  canEditCombat: boolean
  combatActionStatus: string
  combatDraft: CombatParticipantDraft
  combatParticipants: CombatParticipant[]
  combatState: CombatState | null
  isPlayerInitiativeVisible: boolean
  isStorageBusy: boolean
  selectedParticipantId: CombatParticipantId | null
  onAdvanceRound(): Promise<void>
  onAdvanceTurn(): Promise<void>
  onCombatDraftChange(patch: Partial<CombatParticipantDraft>): void
  onCreateParticipant(): Promise<void>
  onDeleteParticipant(): Promise<void>
  onNewParticipantDraft(): void
  onSelectParticipant(participant: CombatParticipant): void
  onSetPlayerInitiativeVisible(isVisible: boolean): Promise<void>
  onStartCombat(): Promise<void>
  onStopCombat(): Promise<void>
  onUpdateParticipant(): Promise<void>
}

function CombatTrackerPanel({
  activeParticipant,
  canEditCombat,
  combatActionStatus,
  combatDraft,
  combatParticipants,
  combatState,
  isPlayerInitiativeVisible,
  isStorageBusy,
  onAdvanceRound,
  onAdvanceTurn,
  onCombatDraftChange,
  onCreateParticipant,
  onDeleteParticipant,
  onNewParticipantDraft,
  onSelectParticipant,
  onSetPlayerInitiativeVisible,
  onStartCombat,
  onStopCombat,
  onUpdateParticipant,
  selectedParticipantId,
}: CombatTrackerPanelProps) {
  const canRunCombat = canEditCombat && combatParticipants.length > 0
  const isCombatActive = Boolean(combatState?.isActive)

  return (
    <section className="combat-tracker-panel" id="section-combat" aria-label="Инициатива">
      <div className="module-header">
        <div>
          <p className="eyebrow">Initiative</p>
          <h2>Инициатива</h2>
        </div>
        <span className={isCombatActive ? 'status-badge' : 'status-badge status-badge--neutral'}>
          {isCombatActive ? `Раунд ${combatState?.round ?? 1}` : 'ожидание'}
        </span>
      </div>

      <dl className="status-grid status-grid--compact">
        <div>
          <dt>Участники</dt>
          <dd>{combatParticipants.length}</dd>
        </div>
        <div>
          <dt>Текущий ход</dt>
          <dd>{activeParticipant?.name ?? '-'}</dd>
        </div>
        <div>
          <dt>Раунд</dt>
          <dd>{combatState?.round ?? 0}</dd>
        </div>
      </dl>

      <form
        className="combat-form"
        onSubmit={(event) => {
          event.preventDefault()
          void onCreateParticipant()
        }}
      >
        <div className="combat-form__header">
          <h3>Участник</h3>
          <button
            className="button button--secondary"
            disabled={!canEditCombat || isStorageBusy}
            onClick={onNewParticipantDraft}
            type="button"
          >
            Новый
          </button>
        </div>
        <div className="combat-form__fields">
          <label>
            <span>Имя</span>
            <input
              disabled={!canEditCombat || isStorageBusy}
              onChange={(event) => onCombatDraftChange({ name: event.target.value })}
              placeholder="Например: Леди Мира"
              value={combatDraft.name}
            />
          </label>
          <label>
            <span>Инициатива</span>
            <input
              disabled={!canEditCombat || isStorageBusy}
              onChange={(event) => onCombatDraftChange({ initiative: event.target.value })}
              type="number"
              value={combatDraft.initiative}
            />
          </label>
        </div>
        <div className="combat-form__toggles">
          <label className="switch-control switch-control--wide">
            <input
              checked={combatDraft.isPlayerControlled}
              disabled={!canEditCombat || isStorageBusy}
              onChange={(event) => onCombatDraftChange({ isPlayerControlled: event.target.checked })}
              type="checkbox"
            />
            <span>Игрок управляет</span>
          </label>
          <label className="switch-control switch-control--wide">
            <input
              checked={combatDraft.isDefeated}
              disabled={!canEditCombat || isStorageBusy}
              onChange={(event) => onCombatDraftChange({ isDefeated: event.target.checked })}
              type="checkbox"
            />
            <span>Выбыл</span>
          </label>
        </div>
        <div className="combat-form__actions">
          <button className="button" disabled={!canEditCombat || isStorageBusy} type="submit">
            Добавить
          </button>
          <button
            className="button button--secondary"
            disabled={!canEditCombat || isStorageBusy || selectedParticipantId === null}
            onClick={() => void onUpdateParticipant()}
            type="button"
          >
            Сохранить
          </button>
          <button
            className="button button--danger"
            disabled={!canEditCombat || isStorageBusy || selectedParticipantId === null}
            onClick={() => void onDeleteParticipant()}
            type="button"
          >
            Удалить
          </button>
        </div>
      </form>

      <div className="combat-controls">
        <button
          className="button"
          disabled={!canRunCombat || isStorageBusy || isCombatActive}
          onClick={() => void onStartCombat()}
          type="button"
        >
          Начать
        </button>
        <button
          className="button button--secondary"
          disabled={!canRunCombat || isStorageBusy || !isCombatActive}
          onClick={() => void onAdvanceTurn()}
          type="button"
        >
          Следующий ход
        </button>
        <button
          className="button button--secondary"
          disabled={!canRunCombat || isStorageBusy || !isCombatActive}
          onClick={() => void onAdvanceRound()}
          type="button"
        >
          Следующий раунд
        </button>
        <button
          className="button button--secondary"
          disabled={!canRunCombat || isStorageBusy || !isCombatActive}
          onClick={() => void onStopCombat()}
          type="button"
        >
          Стоп
        </button>
      </div>

      <label className="combat-visibility-toggle switch-control switch-control--wide">
        <input
          checked={isPlayerInitiativeVisible}
          disabled={!canEditCombat || isStorageBusy}
          onChange={(event) => void onSetPlayerInitiativeVisible(event.target.checked)}
          type="checkbox"
        />
        <span>Показывать инициативу игрокам</span>
      </label>

      {combatParticipants.length === 0 ? (
        <div className="empty-panel-state empty-panel-state--compact">
          <h3>Участников пока нет</h3>
          <p>Добавьте имена и значения инициативы вручную.</p>
        </div>
      ) : (
        <ul className="combat-list">
          {combatParticipants.map((participant) => {
            const isSelected = participant.id === selectedParticipantId
            const isActive = participant.id === activeParticipant?.id

            return (
              <li
                className={[
                  'combat-item',
                  isSelected ? 'combat-item--selected' : '',
                  isActive ? 'combat-item--active' : '',
                  participant.isDefeated ? 'combat-item--defeated' : '',
                ].filter(Boolean).join(' ')}
                key={participant.id}
              >
                <button onClick={() => onSelectParticipant(participant)} type="button">
                  <div className="combat-item__initiative">{participant.initiative}</div>
                  <div className="combat-item__content">
                    <div className="combat-item__title">
                      <span>{participant.name}</span>
                      {isActive ? <small>ход</small> : null}
                    </div>
                    <div className="combat-item__meta">
                      <small>{participant.isPlayerControlled ? 'игрок' : 'мастер'}</small>
                      {participant.isDefeated ? <small>выбыл</small> : null}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <p className="form-status">{combatActionStatus}</p>
    </section>
  )
}

function PlayerScreenControls({
  activeScene,
  isStorageBusy,
  onClear,
  onPublishActiveScene,
  playerActionStatus,
  playerStatus,
  runPlayerAction,
}: PlayerScreenControlsProps) {
  const isActiveScenePublished =
    activeScene !== null &&
    playerStatus.state.mode === 'scene' &&
    playerStatus.state.activeSceneId === activeScene.id

  return (
    <section className="player-control-panel" id="section-players" aria-label="Экран игроков">
      <details className="player-control-panel__details">
        <summary>
          <span>Экран игрока</span>
          <span className={playerStatus.isOpen ? 'status-badge' : 'status-badge status-badge--neutral'}>
            {playerStatus.isOpen ? 'ON' : 'OFF'}
          </span>
        </summary>
        <div className="player-control-panel__actions">
          <button
            aria-label={playerStatus.isOpen ? 'Выключить экран игрока' : 'Включить экран игрока'}
            aria-pressed={playerStatus.isOpen}
            className="button"
            disabled={isStorageBusy}
            onClick={() =>
              void runPlayerAction(
                playerStatus.isOpen ? 'Экран игроков выключен.' : 'Экран игроков включен.',
                () => (playerStatus.isOpen ? desktopApi.playerScreen.close() : desktopApi.playerScreen.open()),
              )
            }
            type="button"
          >
            {playerStatus.isOpen ? 'ON' : 'OFF'}
          </button>
          <button
            aria-pressed={playerStatus.isFullscreen}
            className="button button--secondary"
            disabled={!playerStatus.isOpen || isStorageBusy}
            onClick={() =>
              void runPlayerAction('Режим fullscreen экрана игроков изменен.', () => desktopApi.playerScreen.toggleFullscreen())
            }
            type="button"
          >
            Fullscreen
          </button>
          <button
            className="button button--secondary"
            disabled={isStorageBusy}
            onClick={() => void onClear()}
            type="button"
          >
            Clear
          </button>
          {isActiveScenePublished ? (
            <span className="player-control-panel__scene-status">Сцена активна</span>
          ) : (
            <button
              className="button button--secondary"
              disabled={activeScene === null || isStorageBusy}
              onClick={() => void onPublishActiveScene()}
              type="button"
            >
              Активная сцена
            </button>
          )}
        </div>
        <p className="muted">{playerActionStatus}</p>
      </details>

    </section>
  )
}

interface RightPanelContentProps {
  activeUserLayer: SceneUserLayerId
  activeRightPanel: RightPanelTab
  assetActionStatus: string
  assetImportTags: string
  assetKind: ImageAssetKind
  assetKindFilter: AssetLibraryKindFilter
  assetName: string
  assetSearchQuery: string
  assetSelectedTags: string[]
  assetTagDrafts: Record<AssetId, string>
  assets: Asset[]
  canEditCharacters: boolean
  canEditNotes: boolean
  canImportAssets: boolean
  canUseAssetsInScene: boolean
  characterActionStatus: string
  characterCards: CharacterCard[]
  characterDraft: CharacterCardDraft
  activePlayerHandoutId: string | null
  isStorageBusy: boolean
  isPlayerHandoutVisible: boolean
  noteActionStatus: string
  noteDraft: NoteDraft
  notes: Note[]
  onAssetImportTagsChange(tags: string): void
  onAssetKindChange(kind: ImageAssetKind): void
  onAssetKindFilterChange(kind: AssetLibraryKindFilter): void
  onAssetNameChange(name: string): void
  onAssetSearchQueryChange(query: string): void
  onAssetTagDraftChange(assetId: AssetId, value: string): void
  onAssetTagToggle(tags: string[]): void
  onImportImageAsset(): Promise<void>
  onSendAssetToPlayers(assetId: AssetId): Promise<void>
  onUpdateAssetTags(assetId: AssetId): Promise<void>
  onUseAssetInActiveScene(assetId: AssetId): Promise<void>
  onCharacterDraftChange(patch: Partial<CharacterCardDraft>): void
  onCreateCharacterCard(): Promise<void>
  onDeleteCharacterCard(): Promise<void>
  onNewCharacterCardDraft(): void
  onSelectCharacterCard(card: CharacterCard): void
  onUpdateCharacterCard(): Promise<void>
  onCreateNote(): Promise<void>
  onDeleteNote(): Promise<void>
  onHidePlayerHandout(): Promise<void>
  onNewNoteDraft(): void
  onNoteDraftChange(patch: Partial<NoteDraft>): void
  onSelectNote(note: Note): void
  onSendNoteToPlayers(noteId: NoteId): Promise<void>
  onUpdateNote(): Promise<void>
  portraitAssets: Asset[]
  selectedCharacterCardId: CharacterCardId | null
  selectedNoteId: NoteId | null
}

function renderRightPanelContent(props: RightPanelContentProps) {
  if (props.activeRightPanel === 'assets') {
    return <AssetPanel {...props} />
  }

  if (props.activeRightPanel === 'characters') {
    return <CharacterPanel {...props} />
  }

  return <NotePanel {...props} />
}

function NotePanel({
  activePlayerHandoutId,
  canEditNotes,
  isPlayerHandoutVisible,
  isStorageBusy,
  noteActionStatus,
  noteDraft,
  notes,
  onCreateNote,
  onDeleteNote,
  onHidePlayerHandout,
  onNewNoteDraft,
  onNoteDraftChange,
  onSelectNote,
  onSendNoteToPlayers,
  onUpdateNote,
  selectedNoteId,
}: RightPanelContentProps) {
  const selectedNote = notes.find((note) => note.id === selectedNoteId) ?? null
  const canSendSelectedNote = selectedNote !== null && selectedNote.scope === 'players'

  return (
    <section className="context-panel__body" role="tabpanel">
      <form
        className="note-form"
        onSubmit={(event) => {
          event.preventDefault()
          void onCreateNote()
        }}
      >
        <div className="note-form__header">
          <h3>Заметка</h3>
          <button
            className="button button--secondary"
            disabled={!canEditNotes || isStorageBusy}
            onClick={onNewNoteDraft}
            type="button"
          >
            Новая
          </button>
        </div>
        <label>
          <span>Название</span>
          <input
            disabled={!canEditNotes || isStorageBusy}
            onChange={(event) => onNoteDraftChange({ title: event.target.value })}
            placeholder="Письмо из башни"
            value={noteDraft.title}
          />
        </label>
        <label>
          <span>Текст</span>
          <textarea
            disabled={!canEditNotes || isStorageBusy}
            onChange={(event) => onNoteDraftChange({ body: event.target.value })}
            placeholder="Текст заметки или handout"
            rows={5}
            value={noteDraft.body}
          />
        </label>
        <label className="note-scope-toggle">
          <input
            checked={noteDraft.scope === 'master'}
            disabled={!canEditNotes || isStorageBusy}
            onChange={(event) => onNoteDraftChange({ scope: event.target.checked ? 'master' : 'players' })}
            type="checkbox"
          />
          <span>Секретная заметка мастера</span>
        </label>

        <div className="note-form__actions">
          <button className="button" disabled={!canEditNotes || isStorageBusy} type="submit">
            Создать
          </button>
          <button
            className="button button--secondary"
            disabled={!canEditNotes || isStorageBusy || selectedNoteId === null}
            onClick={() => void onUpdateNote()}
            type="button"
          >
            Сохранить
          </button>
          <button
            className="button button--danger"
            disabled={!canEditNotes || isStorageBusy || selectedNoteId === null}
            onClick={() => void onDeleteNote()}
            type="button"
          >
            Удалить
          </button>
        </div>
        <div className="note-player-actions">
          <button
            className="button"
            disabled={!canEditNotes || isStorageBusy || !canSendSelectedNote}
            onClick={() => selectedNoteId && void onSendNoteToPlayers(selectedNoteId)}
            type="button"
          >
            Показать игрокам
          </button>
          <button
            className="button button--secondary"
            disabled={!canEditNotes || isStorageBusy || !isPlayerHandoutVisible}
            onClick={() => void onHidePlayerHandout()}
            type="button"
          >
            Скрыть у игроков
          </button>
        </div>
      </form>

      {notes.length === 0 ? (
        <div className="empty-panel-state">
          <h3>Заметок пока нет</h3>
          <p>Новая запись сохранится внутри открытой кампании.</p>
        </div>
      ) : (
        <ul className="note-list">
          {notes.map((note) => {
            const isActive = note.id === selectedNoteId
            const isVisibleHandout = note.id === activePlayerHandoutId

            return (
              <li className={isActive ? 'note-item note-item--active' : 'note-item'} key={note.id}>
                <button onClick={() => onSelectNote(note)} type="button">
                  <div className="note-item__header">
                    <span>{note.title}</span>
                    <small className={note.scope === 'players' ? 'asset-tag' : 'asset-tag asset-tag--muted'}>
                      {getNoteScopeLabel(note.scope)}
                    </small>
                  </div>
                  <p>{note.body === '' ? 'Без текста' : note.body}</p>
                  <div className="note-item__meta">
                    <small>{formatTimestamp(note.updatedAt)}</small>
                    {isVisibleHandout ? <small>на экране</small> : null}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {selectedNote ? (
        <div className="note-preview">
          <div>
            <p className="eyebrow">Preview</p>
            <h3>{selectedNote.title}</h3>
            <span className={selectedNote.scope === 'players' ? 'asset-tag' : 'asset-tag asset-tag--muted'}>
              {getNoteScopeLabel(selectedNote.scope)}
            </span>
          </div>
          <p>{selectedNote.body === '' ? 'Пустая заметка.' : selectedNote.body}</p>
        </div>
      ) : null}

      <p className="form-status">{noteActionStatus}</p>
    </section>
  )
}

function CharacterPanel({
  canEditCharacters,
  characterActionStatus,
  characterCards,
  characterDraft,
  isStorageBusy,
  onCharacterDraftChange,
  onCreateCharacterCard,
  onDeleteCharacterCard,
  onNewCharacterCardDraft,
  onSelectCharacterCard,
  onUpdateCharacterCard,
  portraitAssets,
  selectedCharacterCardId,
}: RightPanelContentProps) {
  const selectedCard = characterCards.find((card) => card.id === selectedCharacterCardId) ?? null

  return (
    <section className="context-panel__body" role="tabpanel">
      <form
        className="character-card-form"
        onSubmit={(event) => {
          event.preventDefault()
          void onCreateCharacterCard()
        }}
      >
        <div className="character-card-form__header">
          <div>
            <p className="eyebrow">Карточка</p>
            <h3>{selectedCard ? 'Редактирование карточки' : 'Новая карточка'}</h3>
          </div>
          <button className="button button--secondary" disabled={!canEditCharacters || isStorageBusy} onClick={onNewCharacterCardDraft} type="button">
            Новая
          </button>
        </div>

        <label>
          <span>Имя</span>
          <input
            disabled={!canEditCharacters || isStorageBusy}
            onChange={(event) => onCharacterDraftChange({ name: event.target.value })}
            placeholder="Например: Леди Мира"
            value={characterDraft.name}
          />
        </label>
        <label>
          <span>Тип</span>
          <select
            disabled={!canEditCharacters || isStorageBusy}
            onChange={(event) => onCharacterDraftChange({ kind: event.target.value as CharacterCardKind })}
            value={characterDraft.kind}
          >
            <option value="player">Игрок</option>
            <option value="npc">NPC</option>
            <option value="monster">Монстр</option>
          </select>
        </label>
        <label>
          <span>Игрок / роль</span>
          <input
            disabled={!canEditCharacters || isStorageBusy}
            onChange={(event) => onCharacterDraftChange({ playerName: event.target.value })}
            placeholder="Например: Артем"
            value={characterDraft.playerName}
          />
        </label>
        <label>
          <span>Кратко</span>
          <textarea
            disabled={!canEditCharacters || isStorageBusy}
            onChange={(event) => onCharacterDraftChange({ description: event.target.value })}
            placeholder="Короткое описание для мастера"
            rows={2}
            value={characterDraft.description}
          />
        </label>
        <div className="character-card-form__numbers">
          <label>
            <span>HP</span>
            <input
              disabled={!canEditCharacters || isStorageBusy}
              min={0}
              onChange={(event) => onCharacterDraftChange({ hitPointsCurrent: event.target.value })}
              type="number"
              value={characterDraft.hitPointsCurrent}
            />
          </label>
          <label>
            <span>Max HP</span>
            <input
              disabled={!canEditCharacters || isStorageBusy}
              min={0}
              onChange={(event) => onCharacterDraftChange({ hitPointsMaximum: event.target.value })}
              type="number"
              value={characterDraft.hitPointsMaximum}
            />
          </label>
          <label>
            <span>Temp</span>
            <input
              disabled={!canEditCharacters || isStorageBusy}
              min={0}
              onChange={(event) => onCharacterDraftChange({ hitPointsTemporary: event.target.value })}
              type="number"
              value={characterDraft.hitPointsTemporary}
            />
          </label>
          <label>
            <span>AC</span>
            <input
              disabled={!canEditCharacters || isStorageBusy}
              min={0}
              onChange={(event) => onCharacterDraftChange({ armorClass: event.target.value })}
              type="number"
              value={characterDraft.armorClass}
            />
          </label>
          <label>
            <span>Init</span>
            <input
              disabled={!canEditCharacters || isStorageBusy}
              onChange={(event) => onCharacterDraftChange({ initiativeModifier: event.target.value })}
              type="number"
              value={characterDraft.initiativeModifier}
            />
          </label>
        </div>
        <label>
          <span>Портрет</span>
          <select
            disabled={!canEditCharacters || isStorageBusy || portraitAssets.length === 0}
            onChange={(event) => onCharacterDraftChange({ portraitAssetId: event.target.value })}
            value={characterDraft.portraitAssetId}
          >
            <option value="">Без портрета</option>
            {portraitAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Заметки</span>
          <textarea
            disabled={!canEditCharacters || isStorageBusy}
            onChange={(event) => onCharacterDraftChange({ notes: event.target.value })}
            placeholder="Приватные заметки мастера"
            rows={3}
            value={characterDraft.notes}
          />
        </label>

        <div className="character-card-form__actions">
          <button className="button" disabled={!canEditCharacters || isStorageBusy} type="submit">
            Создать
          </button>
          <button
            className="button button--secondary"
            disabled={!canEditCharacters || isStorageBusy || selectedCharacterCardId === null}
            onClick={() => void onUpdateCharacterCard()}
            type="button"
          >
            Сохранить
          </button>
          <button
            className="button button--danger"
            disabled={!canEditCharacters || isStorageBusy || selectedCharacterCardId === null}
            onClick={() => void onDeleteCharacterCard()}
            type="button"
          >
            Удалить
          </button>
        </div>
      </form>

      {characterCards.length === 0 ? (
        <div className="empty-panel-state">
          <h3>Карточек пока нет</h3>
          <p>Создайте игрока, NPC или монстра с базовыми HP, AC и заметками.</p>
        </div>
      ) : (
        <ul className="character-card-list">
          {characterCards.map((card) => (
            <li className={card.id === selectedCharacterCardId ? 'character-card-item character-card-item--active' : 'character-card-item'} key={card.id}>
              <button onClick={() => onSelectCharacterCard(card)} type="button">
                <div className="character-card-item__title">
                  <span>{card.name}</span>
                  <small>{getCharacterKindLabel(card.kind)}</small>
                </div>
                <dl>
                  <div>
                    <dt>HP</dt>
                    <dd>{formatCharacterHitPoints(card)}</dd>
                  </div>
                  <div>
                    <dt>AC</dt>
                    <dd>{card.armorClass ?? '-'}</dd>
                  </div>
                  <div>
                    <dt>Init</dt>
                    <dd>{formatSignedNumber(card.initiativeModifier)}</dd>
                  </div>
                </dl>
                {card.description ? <p>{card.description}</p> : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selectedCard ? (
        <div className="character-card-preview">
          <div>
            <p className="eyebrow">Preview</p>
            <h3>{selectedCard.name}</h3>
            <span className="asset-tag">{getCharacterKindLabel(selectedCard.kind)}</span>
          </div>
          <dl className="status-grid status-grid--compact">
            <div>
              <dt>HP</dt>
              <dd>{formatCharacterHitPoints(selectedCard)}</dd>
            </div>
            <div>
              <dt>AC</dt>
              <dd>{selectedCard.armorClass ?? '-'}</dd>
            </div>
            <div>
              <dt>Init</dt>
              <dd>{formatSignedNumber(selectedCard.initiativeModifier)}</dd>
            </div>
          </dl>
          {selectedCard.notes ? <p className="muted">{selectedCard.notes}</p> : null}
        </div>
      ) : null}

      <p className="form-status">{characterActionStatus}</p>
    </section>
  )
}

function AssetPanel({
  activeUserLayer,
  assetActionStatus,
  assetImportTags,
  assetKind,
  assetKindFilter,
  assetName,
  assetSearchQuery,
  assetSelectedTags,
  assetTagDrafts,
  assets,
  canImportAssets,
  canUseAssetsInScene,
  isStorageBusy,
  onAssetImportTagsChange,
  onAssetKindChange,
  onAssetKindFilterChange,
  onAssetNameChange,
  onAssetSearchQueryChange,
  onAssetTagDraftChange,
  onAssetTagToggle,
  onImportImageAsset,
  onSendAssetToPlayers,
  onUpdateAssetTags,
  onUseAssetInActiveScene,
}: RightPanelContentProps) {
  const libraryView = createAssetLibraryView(assets, {
    kind: assetKindFilter,
    searchQuery: assetSearchQuery,
    selectedTags: assetSelectedTags,
  })

  return (
    <section className="context-panel__body" role="tabpanel">
      <form
        className="asset-import-form"
        onSubmit={(event) => {
          event.preventDefault()
          void onImportImageAsset()
        }}
      >
        <label>
          <span>Тип</span>
          <select
            disabled={!canImportAssets || isStorageBusy}
            onChange={(event) => onAssetKindChange(event.target.value as ImageAssetKind)}
            value={assetKind}
          >
            <option value="map">Карта</option>
            <option value="handout">Handout</option>
            <option value="portrait">Портрет</option>
            <option value="token">Токен</option>
            <option value="other">Другое</option>
          </select>
        </label>
        <label>
          <span>Название</span>
          <input
            disabled={!canImportAssets || isStorageBusy}
            onChange={(event) => onAssetNameChange(event.target.value)}
            placeholder="Например: Карта подземелья"
            value={assetName}
          />
        </label>
        <label>
          <span>Теги</span>
          <input
            disabled={!canImportAssets || isStorageBusy}
            onChange={(event) => onAssetImportTagsChange(event.target.value)}
            placeholder="например: лес, ночь, босс"
            value={assetImportTags}
          />
        </label>
        <button className="button" disabled={!canImportAssets || isStorageBusy} type="submit">
          Импортировать изображение
        </button>
      </form>

      {assets.length === 0 ? (
        <div className="empty-panel-state">
          <h3>Изображений пока нет</h3>
          <p>Импортированная карта привяжется к активной сцене, остальные изображения останутся в библиотеке.</p>
        </div>
      ) : (
        <>
          <div className="asset-library-tools">
            <label>
              <span>Поиск</span>
              <input
                onChange={(event) => onAssetSearchQueryChange(event.target.value)}
                placeholder="название, тип или тег"
                value={assetSearchQuery}
              />
            </label>
            <label>
              <span>Тип</span>
              <select
                onChange={(event) => onAssetKindFilterChange(event.target.value as AssetLibraryKindFilter)}
                value={assetKindFilter}
              >
                <option value="all">Все</option>
                <option value="map">Карты</option>
                <option value="handout">Handouts</option>
                <option value="portrait">Портреты</option>
                <option value="token">Токены</option>
                <option value="other">Другое</option>
              </select>
            </label>
            {libraryView.tags.length > 0 ? (
              <div className="asset-tag-filter-list" aria-label="Фильтр по тегам">
                {libraryView.tags.map((tag) => {
                  const isSelected = assetSelectedTags.includes(tag.name)
                  const nextTags = isSelected
                    ? assetSelectedTags.filter((selectedTag) => selectedTag !== tag.name)
                    : [...assetSelectedTags, tag.name]

                  return (
                    <button
                      className={isSelected ? 'asset-tag asset-tag--active' : 'asset-tag'}
                      key={tag.name}
                      onClick={() => onAssetTagToggle(nextTags)}
                      type="button"
                    >
                      {tag.name}
                      <small>{tag.count}</small>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>

          {libraryView.assets.length === 0 ? (
            <div className="empty-panel-state">
              <h3>Ассеты не найдены</h3>
              <p>Измените поиск, тип или выбранные теги.</p>
            </div>
          ) : (
            <ul className="asset-list">
              {libraryView.assets.map((asset) => (
                <li className="asset-item" key={asset.id}>
                  <div className="asset-thumb">
                    <img alt="" src={asset.filePath} />
                  </div>
                  <div className="asset-item__content">
                    <div>
                      <span>{asset.name}</span>
                      <small>
                        {getAssetKindLabel(asset.kind)} · {formatTimestamp(asset.createdAt)}
                      </small>
                    </div>
                    <div className="asset-tags">
                      {asset.tags.length > 0 ? (
                        asset.tags.map((tag) => (
                          <span className="asset-tag" key={tag}>
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="asset-tag asset-tag--muted">без тегов</span>
                      )}
                    </div>
                    <label className="asset-tag-editor">
                      <span>Теги</span>
                      <input
                        aria-label={`Теги ассета ${asset.name}`}
                        disabled={isStorageBusy}
                        onChange={(event) => onAssetTagDraftChange(asset.id, event.target.value)}
                        value={assetTagDrafts[asset.id] ?? asset.tags.join(', ')}
                      />
                    </label>
                  </div>
                  <div className="asset-item__actions">
                    <button
                      aria-label={`Добавить ${asset.name} на слой ${getSceneUserLayerLabel(activeUserLayer)}`}
                      className="button button--secondary"
                      disabled={!canUseAssetsInScene || isStorageBusy}
                      onClick={() => void onUseAssetInActiveScene(asset.id)}
                      type="button"
                    >
                      На слой {getSceneUserLayerLabel(activeUserLayer)}
                    </button>
                    <button
                      className="button button--secondary"
                      disabled={isStorageBusy}
                      onClick={() => void onUpdateAssetTags(asset.id)}
                      type="button"
                    >
                      Теги
                    </button>
                    <button
                      className="button button--secondary"
                      disabled={isStorageBusy}
                      onClick={() => void onSendAssetToPlayers(asset.id)}
                      type="button"
                    >
                      Показать
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="form-status">{assetActionStatus}</p>
    </section>
  )
}

function getSceneUserLayerLabel(userLayer: SceneUserLayerId): string {
  switch (userLayer) {
    case 'map':
      return 'Карта'
    case 'master':
      return 'ГМ'
    case 'tokens':
      return 'Токены'
  }
}

function getWorkspaceNavigationSection(event: Event): WorkspaceSection | null {
  if (!(event instanceof CustomEvent) || !isRecord(event.detail)) {
    return null
  }

  const section = event.detail.section
  return isWorkspaceSection(section) ? section : null
}

function isWorkspaceSection(value: unknown): value is WorkspaceSection {
  return (
    value === 'scenes' ||
    value === 'assets' ||
    value === 'combat' ||
    value === 'notes' ||
    value === 'players'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getActiveSceneFromCampaign(campaign: Campaign) {
  return campaign.scenes.find((scene) => scene.isActive) ?? campaign.scenes[0] ?? null
}

function getPlayerModeLabel(mode: PlayerScreenState['mode']): string {
  switch (mode) {
    case 'scene':
      return 'сцена'
    case 'image':
      return 'изображение'
    case 'split':
      return 'сплит'
    case 'blank':
      return 'пусто'
  }
}

function createCharacterCardInput(draft: CharacterCardDraft): CharacterCardInput {
  return {
    name: draft.name,
    kind: draft.kind,
    playerName: draft.playerName,
    description: draft.description,
    armorClass: getOptionalNumberValue(draft.armorClass),
    hitPointsCurrent: getOptionalNumberValue(draft.hitPointsCurrent),
    hitPointsMaximum: getOptionalNumberValue(draft.hitPointsMaximum),
    hitPointsTemporary: getOptionalNumberValue(draft.hitPointsTemporary),
    initiativeModifier: getOptionalNumberValue(draft.initiativeModifier),
    portraitAssetId: draft.portraitAssetId,
    notes: draft.notes,
  }
}

function createCharacterCardDraft(card: CharacterCard): CharacterCardDraft {
  return {
    name: card.name,
    kind: card.kind,
    playerName: card.playerName ?? '',
    description: card.description ?? '',
    armorClass: card.armorClass?.toString() ?? '',
    hitPointsCurrent: card.hitPoints?.current.toString() ?? '',
    hitPointsMaximum: card.hitPoints?.maximum.toString() ?? '',
    hitPointsTemporary: card.hitPoints?.temporary?.toString() ?? '',
    initiativeModifier: card.initiativeModifier?.toString() ?? '',
    portraitAssetId: card.portraitAssetId ?? '',
    notes: card.notes ?? '',
  }
}

function createNoteInput(draft: NoteDraft): NoteInput {
  return {
    title: draft.title,
    body: draft.body,
    scope: draft.scope,
  }
}

function createNoteDraft(note: Note): NoteDraft {
  return {
    title: note.title,
    body: note.body,
    scope: note.scope,
  }
}

function createCombatParticipantInput(draft: CombatParticipantDraft): CombatParticipantInput {
  return {
    name: draft.name,
    initiative: getOptionalNumberValue(draft.initiative) ?? 0,
    isPlayerControlled: draft.isPlayerControlled,
    isDefeated: draft.isDefeated,
  }
}

function createCombatParticipantDraft(participant: CombatParticipant): CombatParticipantDraft {
  return {
    name: participant.name,
    initiative: participant.initiative.toString(),
    isPlayerControlled: participant.isPlayerControlled,
    isDefeated: participant.isDefeated,
  }
}

function getActiveCombatParticipantLabel(participants: CombatParticipant[], turnIndex: number): string {
  return participants[turnIndex]?.name ?? 'нет участника'
}

function getOptionalNumberValue(value: string): number | undefined {
  if (value.trim() === '') {
    return undefined
  }

  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : undefined
}

function getCharacterKindLabel(kind: CharacterCardKind): string {
  switch (kind) {
    case 'player':
      return 'Игрок'
    case 'npc':
      return 'NPC'
    case 'monster':
      return 'Монстр'
  }
}

function getNoteScopeLabel(scope: NoteScope): string {
  return scope === 'players' ? 'игрокам' : 'мастер'
}

function formatCharacterHitPoints(card: CharacterCard): string {
  if (!card.hitPoints) {
    return '-'
  }

  const temporary = card.hitPoints.temporary ? ` +${card.hitPoints.temporary}` : ''
  return `${card.hitPoints.current}/${card.hitPoints.maximum}${temporary}`
}

function formatSignedNumber(value: number | undefined): string {
  if (value === undefined) {
    return '-'
  }

  return value > 0 ? `+${value}` : value.toString()
}

function getStatusFromPlayerAction(result: PlayerActionResult): PlayerScreenStatus {
  if ('status' in result) {
    return result.status
  }

  return {
    isOpen: result.isOpen,
    isFullscreen: result.isFullscreen,
    state: result.state,
  }
}

function getPlayerActionLabel(label: string, result: PlayerActionResult): string {
  if ('opened' in result && !result.opened) {
    return 'Electron API недоступен для открытия окна игроков.'
  }

  if ('opened' in result && result.alreadyOpen) {
    return 'Существующее окно игроков сфокусировано.'
  }

  if ('ok' in result && !result.ok && result.reason === 'player-window-not-open') {
    return 'Окно игроков сейчас закрыто.'
  }

  if ('ok' in result && !result.ok) {
    return 'Действие недоступно.'
  }

  return label
}

function getCampaignSaveStatusLabel(status: string): string {
  switch (status) {
    case 'dirty':
      return 'Есть изменения'
    case 'saving':
      return 'Сохраняется'
    case 'saved':
      return 'Сохранено'
    case 'error':
      return 'Ошибка сохранения'
    case 'idle':
    default:
      return 'Ожидание'
  }
}

function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function getAssetKindLabel(kind: AssetKind): string {
  switch (kind) {
    case 'map':
      return 'Карта'
    case 'token':
      return 'Токен'
    case 'portrait':
      return 'Портрет'
    case 'handout':
      return 'Handout'
    case 'audio':
      return 'Audio'
    case 'other':
      return 'Изображение'
  }
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}
