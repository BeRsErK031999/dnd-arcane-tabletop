import { useEffect, useMemo, useState } from 'react'
import {
  createAssetLibraryView,
  normalizeAssetTags,
  type AssetLibraryKindFilter,
} from '@renderer/stores/assetFactory'
import { createCharacterCardList, type CharacterCardInput } from '@renderer/stores/characterCardFactory'
import { desktopApi } from '@renderer/services/desktopApi'
import { getSceneCanvasState } from '@renderer/stores/sceneCanvasFactory'
import { useCampaignsStore } from '@renderer/stores/useCampaignsStore'
import type { SceneMeasurementTemplate, SceneObjectMoveDirection } from '@renderer/stores/sceneToolsFactory'
import { SceneCanvas } from '@renderer/widgets/SceneCanvas'
import {
  createDefaultPlayerScreenState,
  type Asset,
  type AssetId,
  type AssetKind,
  type Campaign,
  type CharacterCard,
  type CharacterCardId,
  type CharacterCardKind,
  type ImageAssetKind,
  type PlayerScreenCommandResult,
  type PlayerScreenOpenResult,
  type PlayerScreenState,
  type PlayerScreenStatus,
  type SceneCanvasObjectId,
  type SceneCanvasObjectTokenState,
  type SceneCanvasViewport,
  type SceneGrid,
} from '@shared/types'

type PlayerActionResult = PlayerScreenCommandResult | PlayerScreenOpenResult
type RightPanelTab = 'assets' | 'characters' | 'notes'

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

interface ToolItem {
  label: string
  shortcut: string
  status: string
}

const toolGroups: Array<{ title: string; items: ToolItem[] }> = [
  {
    title: 'Навигация',
    items: [
      { label: 'Обзор', shortcut: 'V', status: 'active' },
      { label: 'Панорама', shortcut: 'Space', status: 'active' },
      { label: 'Масштаб', shortcut: 'Z', status: 'active' },
    ],
  },
  {
    title: 'Сцена',
    items: [
      { label: 'Сетка', shortcut: 'G', status: 'active' },
      { label: 'Измерение', shortcut: 'M', status: 'active' },
      { label: 'Область', shortcut: 'A', status: 'active' },
    ],
  },
  {
    title: 'Показ игрокам',
    items: [
      { label: 'Scene preview', shortcut: 'P', status: 'stage 1' },
      { label: 'Handout preview', shortcut: 'H', status: 'stage 1' },
    ],
  },
]

export function MasterDashboardPage() {
  const {
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
    createCharacterCard,
    updateCharacterCard,
    deleteCharacterCard,
    moveActiveSceneObject,
    duplicateActiveSceneObject,
    setActiveSceneObjectVisibility,
    updateActiveSceneObjectTokenState,
    importImageAsset,
    updateAssetTags,
    applyAssetToActiveScene,
    sendAssetToPlayers,
  } = useCampaignsStore()
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanelTab>('assets')
  const [newCampaignName, setNewCampaignName] = useState('')
  const [newCampaignDescription, setNewCampaignDescription] = useState('')
  const [editorName, setEditorName] = useState('')
  const [editorDescription, setEditorDescription] = useState('')
  const [campaignActionStatus, setCampaignActionStatus] = useState('JSON-хранилище готово к работе.')
  const [newSceneName, setNewSceneName] = useState('')
  const [newSceneDescription, setNewSceneDescription] = useState('')
  const [sceneActionStatus, setSceneActionStatus] = useState('Откройте кампанию, чтобы управлять сценами.')
  const [assetKind, setAssetKind] = useState<ImageAssetKind>('map')
  const [assetKindFilter, setAssetKindFilter] = useState<AssetLibraryKindFilter>('all')
  const [assetName, setAssetName] = useState('')
  const [assetImportTags, setAssetImportTags] = useState('')
  const [assetSearchQuery, setAssetSearchQuery] = useState('')
  const [assetSelectedTags, setAssetSelectedTags] = useState<string[]>([])
  const [assetTagDrafts, setAssetTagDrafts] = useState<Record<AssetId, string>>({})
  const [assetActionStatus, setAssetActionStatus] = useState('Откройте кампанию, чтобы импортировать изображения.')
  const [selectedSceneObjectId, setSelectedSceneObjectId] = useState<SceneCanvasObjectId | null>(null)
  const [selectedCharacterCardId, setSelectedCharacterCardId] = useState<CharacterCardId | null>(null)
  const [characterDraft, setCharacterDraft] = useState<CharacterCardDraft>(emptyCharacterCardDraft)
  const [characterActionStatus, setCharacterActionStatus] = useState('Откройте кампанию, чтобы создавать карточки.')
  const [playerStatus, setPlayerStatus] = useState<PlayerScreenStatus>(() => ({
    isOpen: false,
    isFullscreen: false,
    state: createDefaultPlayerScreenState(),
  }))
  const [playerActionStatus, setPlayerActionStatus] = useState('Готов к управлению экраном игроков.')

  const totals = useMemo(
    () => ({
      campaigns: campaigns.length,
      scenes: campaigns.reduce((sum, campaign) => sum + campaign.sceneCount, 0),
      assets: campaigns.reduce((sum, campaign) => sum + campaign.assetCount, 0),
      characters: campaigns.reduce((sum, campaign) => sum + campaign.characterCount, 0),
    }),
    [campaigns],
  )
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
  const selectedCharacterCard = useMemo(
    () => characterCards.find((card) => card.id === selectedCharacterCardId) ?? null,
    [characterCards, selectedCharacterCardId],
  )
  const portraitAssets = useMemo(
    () => (selectedCampaign?.assets ?? []).filter((asset) => asset.kind === 'portrait' || asset.kind === 'token'),
    [selectedCampaign?.assets],
  )

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
    { id: 'assets', label: 'Ассеты', count: selectedCampaign?.assets.length ?? totals.assets },
    { id: 'characters', label: 'Персонажи', count: selectedCampaign?.characterCards.length ?? totals.characters },
    { id: 'notes', label: 'Заметки', count: selectedCampaign?.notes.length ?? 0 },
  ]

  const isStorageBusy = status === 'loading' || status === 'saving' || status === 'deleting'
  const hasSelectedCampaign = selectedCampaign !== null
  const selectedCampaignId = selectedCampaign?.id ?? null

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
    setEditorName(selectedCampaign?.name ?? '')
    setEditorDescription(selectedCampaign?.description ?? '')
  }, [selectedCampaign?.name, selectedCampaign?.description])

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
    if (selectedCharacterCardId === null) {
      return
    }

    if (!characterCards.some((card) => card.id === selectedCharacterCardId)) {
      setSelectedCharacterCardId(null)
      setCharacterDraft(emptyCharacterCardDraft)
    }
  }, [characterCards, selectedCharacterCardId])

  useEffect(() => {
    const assets = selectedCampaign?.assets ?? []
    setAssetTagDrafts(Object.fromEntries(assets.map((asset) => [asset.id, asset.tags.join(', ')])))
    setAssetSelectedTags((tags) => {
      const availableTags = new Set(assets.flatMap((asset) => asset.tags))
      return tags.filter((tag) => availableTags.has(tag))
    })
  }, [selectedCampaign?.assets])

  async function handleCreateCampaign(): Promise<void> {
    const result = await createCampaign(newCampaignName, newCampaignDescription)

    if (result.ok) {
      setNewCampaignName('')
      setNewCampaignDescription('')
      setCampaignActionStatus(`Кампания "${result.campaign.name}" создана и сохранена.`)
      setSceneActionStatus('Создайте первую сцену для открытой кампании.')
      setAssetActionStatus('Импортируйте карту или handout для открытой кампании.')
      return
    }

    setCampaignActionStatus('Не удалось создать кампанию.')
  }

  async function handleOpenCampaign(campaignId: string): Promise<void> {
    const result = await openCampaign(campaignId)

    if (result.ok) {
      setCampaignActionStatus(`Кампания "${result.campaign.name}" открыта.`)
      setSceneActionStatus(
        result.campaign.scenes.length === 0
          ? 'В кампании пока нет сцен.'
          : `В кампании доступно сцен: ${result.campaign.scenes.length}.`,
      )
      setAssetActionStatus(
        result.campaign.assets.length === 0
          ? 'В кампании пока нет изображений.'
          : `В кампании доступно изображений: ${result.campaign.assets.length}.`,
      )
      return
    }

    setCampaignActionStatus('Не удалось открыть кампанию.')
  }

  async function handleSaveCampaign(): Promise<void> {
    const result = await saveSelectedCampaign(editorName, editorDescription)

    if (result.ok) {
      setCampaignActionStatus(`Кампания "${result.campaign.name}" сохранена в JSON.`)
      return
    }

    setCampaignActionStatus('Не удалось сохранить кампанию.')
  }

  async function handleDeleteCampaign(): Promise<void> {
    const campaignName = selectedCampaign?.name ?? 'кампания'
    const deleted = await deleteSelectedCampaign()

    if (deleted) {
      setCampaignActionStatus(`Кампания "${campaignName}" удалена.`)
      setSceneActionStatus('Откройте кампанию, чтобы управлять сценами.')
      setAssetActionStatus('Откройте кампанию, чтобы импортировать изображения.')
      return
    }

    setCampaignActionStatus('Не удалось удалить кампанию.')
  }

  async function handleCreateScene(): Promise<void> {
    const result = await createScene(newSceneName, newSceneDescription)

    if (result.ok) {
      const createdScene = result.campaign.scenes[result.campaign.scenes.length - 1]
      setNewSceneName('')
      setNewSceneDescription('')
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

  async function handleUpdateActiveSceneGrid(grid: Partial<SceneGrid>): Promise<void> {
    const result = await updateActiveSceneGrid(grid)

    setSceneActionStatus(result.ok ? 'Настройки сетки сохранены.' : 'Не удалось сохранить настройки сетки.')
  }

  async function handleUpdateActiveSceneViewport(viewport: Partial<SceneCanvasViewport>): Promise<void> {
    const result = await updateActiveSceneViewport(viewport)

    setSceneActionStatus(result.ok ? 'Положение canvas сохранено.' : 'Не удалось сохранить положение canvas.')
  }

  async function handleAddActiveSceneMeasurement(template: SceneMeasurementTemplate): Promise<void> {
    const result = await addActiveSceneMeasurement(template)

    setSceneActionStatus(result.ok ? 'Измерение добавлено.' : 'Не удалось добавить измерение.')
  }

  async function handleClearActiveSceneMeasurements(): Promise<void> {
    const result = await clearActiveSceneMeasurements()

    setSceneActionStatus(result.ok ? 'Измерения очищены.' : 'Не удалось очистить измерения.')
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
    const result = await importImageAsset(assetKind, assetName, normalizeAssetTags(assetImportTags))

    if (result.ok) {
      const asset = result.campaign.assets.find((candidate) => candidate.id === result.assetId)
      setAssetName('')
      setAssetImportTags('')
      setAssetActionStatus(`Изображение "${asset?.name ?? 'без названия'}" импортировано.`)

      if (asset?.kind === 'map') {
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
    const result = await applyAssetToActiveScene(assetId)

    if (result.ok) {
      const asset = result.campaign.assets.find((candidate) => candidate.id === assetId)
      const assetName = asset?.name ?? 'ассет'

      if (asset?.kind === 'map') {
        setSceneActionStatus(`Карта "${assetName}" привязана к активной сцене.`)
        setAssetActionStatus(`Карта "${assetName}" используется как фон сцены.`)
        return
      }

      setSceneActionStatus(`Ассет "${assetName}" добавлен в активную сцену.`)
      setAssetActionStatus(`Ассет "${assetName}" добавлен в активную сцену.`)
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

  return (
    <>
      <header className="page-header page-header--compact">
        <div>
          <p className="eyebrow">Master Console</p>
          <h1>Панель мастера</h1>
          <p className="muted">Stage 10: простые карточки персонажей, NPC и монстров без rules automation.</p>
        </div>
        <div className="button-row">
          {selectedCampaign ? <span className="status-badge">Открыта: {selectedCampaign.name}</span> : null}
          <span className="status-badge">Этап 10</span>
          <button className="button button--secondary" type="button" onClick={refresh}>
            Обновить
          </button>
        </div>
      </header>

      <section className="scene-strip" aria-label="Сцены">
        <div className="scene-strip__header">
          <span>Сцены</span>
          <span className="muted">
            {selectedCampaign ? `${selectedCampaign.scenes.length} в открытой кампании` : 'Откройте кампанию'}
          </span>
        </div>
        <form
          className="scene-strip__actions"
          onSubmit={(event) => {
            event.preventDefault()
            void handleCreateScene()
          }}
        >
          <input
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
                type="button"
              >
                <span>{scene.name}</span>
                <small>{scene.description ?? 'Без описания'}</small>
                <span className="scene-tab__status">{scene.isActive ? 'active' : 'draft'}</span>
              </button>
            ))
          )}
        </div>
        <p className="scene-strip__status">{sceneActionStatus}</p>
      </section>

      <div className="master-workbench">
        <aside className="tool-rail" aria-label="Инструменты мастера">
          <div className="tool-rail__header">
            <h2>Инструменты</h2>
            <span className="status-badge status-badge--neutral">layout</span>
          </div>
          {toolGroups.map((group) => (
            <section className="tool-group" key={group.title}>
              <h3>{group.title}</h3>
              <div className="tool-list">
                {group.items.map((tool) => (
                  <button
                    className={tool.status === 'active' ? 'tool-button tool-button--active' : 'tool-button'}
                    disabled={tool.status !== 'active'}
                    key={tool.label}
                    type="button"
                  >
                    <span>{tool.label}</span>
                    <kbd>{tool.shortcut}</kbd>
                    <small>{tool.status}</small>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </aside>

        <main className="master-stage" aria-label="Рабочая область сцены">
          <section className="workspace-board">
            <div className="workspace-board__toolbar">
              <div>
                <p className="eyebrow">Scene Workspace</p>
                <h2>{activeScene?.name ?? 'Рабочая область сцены'}</h2>
              </div>
              <div className="workspace-board__meta">
                <span>Objects: Stage 9</span>
                <span>Player mode: {playerStatus.state.mode}</span>
              </div>
            </div>

            <SceneCanvas
              assets={selectedCampaign?.assets ?? []}
              characterCards={characterCards}
              isPlayerSynced={Boolean(activeScene && playerStatus.state.activeSceneId === activeScene.id)}
              isStorageBusy={isStorageBusy}
              mapAsset={activeMapAsset}
              onAddMeasurement={(template) => void handleAddActiveSceneMeasurement(template)}
              onClearMeasurements={() => void handleClearActiveSceneMeasurements()}
              onDuplicateObject={(objectId) => void handleDuplicateActiveSceneObject(objectId)}
              onMoveObject={(objectId, direction) => void handleMoveActiveSceneObject(objectId, direction)}
              onSelectObject={setSelectedSceneObjectId}
              onSendToPlayers={() => void handleSendActiveSceneToPlayers()}
              onSetObjectVisibility={(objectId, isPlayerVisible) =>
                void handleSetActiveSceneObjectVisibility(objectId, isPlayerVisible)
              }
              onUpdateObjectTokenState={(objectId, tokenState) =>
                void handleUpdateActiveSceneObjectTokenState(objectId, tokenState)
              }
              onUpdateGrid={(grid) => void handleUpdateActiveSceneGrid(grid)}
              onUpdateViewport={(viewport) => void handleUpdateActiveSceneViewport(viewport)}
              scene={activeScene}
              selectedObjectId={selectedSceneObjectId}
            />
          </section>

          <div className="workspace-lower-grid">
            <section className="campaign-summary campaign-manager" aria-label="Кампании">
              <div className="module-header">
                <div>
                  <p className="eyebrow">Campaigns</p>
                  <h2>Кампании</h2>
                </div>
                <span className="status-badge">{status === 'loading' ? 'Загрузка' : 'JSON'}</span>
              </div>
              <div className="metric-grid metric-grid--compact">
                <div className="metric">
                  <span className="metric__value">{totals.campaigns}</span>
                  <span className="metric__label">кампаний</span>
                </div>
                <div className="metric">
                  <span className="metric__value">{totals.scenes}</span>
                  <span className="metric__label">сцен</span>
                </div>
                <div className="metric">
                  <span className="metric__value">{totals.characters}</span>
                  <span className="metric__label">персонажей</span>
                </div>
              </div>

              <div className="campaign-manager__grid">
                <form
                  className="campaign-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleCreateCampaign()
                  }}
                >
                  <h3>Новая кампания</h3>
                  <label>
                    <span>Название</span>
                    <input
                      onChange={(event) => setNewCampaignName(event.target.value)}
                      placeholder="Например: Башня над рекой"
                      value={newCampaignName}
                    />
                  </label>
                  <label>
                    <span>Описание</span>
                    <textarea
                      onChange={(event) => setNewCampaignDescription(event.target.value)}
                      placeholder="Короткая заметка для мастера"
                      rows={3}
                      value={newCampaignDescription}
                    />
                  </label>
                  <button className="button" disabled={isStorageBusy} type="submit">
                    Создать кампанию
                  </button>
                </form>

                <form
                  className="campaign-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleSaveCampaign()
                  }}
                >
                  <h3>Открытая кампания</h3>
                  <label>
                    <span>Название</span>
                    <input
                      disabled={selectedCampaign === null}
                      onChange={(event) => setEditorName(event.target.value)}
                      placeholder="Откройте кампанию"
                      value={editorName}
                    />
                  </label>
                  <label>
                    <span>Описание</span>
                    <textarea
                      disabled={selectedCampaign === null}
                      onChange={(event) => setEditorDescription(event.target.value)}
                      placeholder="Описание выбранной кампании"
                      rows={3}
                      value={editorDescription}
                    />
                  </label>
                  <div className="button-row">
                    <button className="button" disabled={selectedCampaign === null || isStorageBusy} type="submit">
                      Сохранить
                    </button>
                    <button
                      className="button button--danger"
                      disabled={selectedCampaign === null || isStorageBusy}
                      onClick={() => void handleDeleteCampaign()}
                      type="button"
                    >
                      Удалить
                    </button>
                  </div>
                </form>
              </div>

              <section className="campaign-list" aria-label="Сохраненные кампании">
                <div className="campaign-list__header">
                  <h3>JSON-файлы</h3>
                  <span>{campaigns.length}</span>
                </div>
                {campaigns.length === 0 ? (
                  <p className="muted">Кампаний пока нет. Новая запись сохранится в `data/campaigns`.</p>
                ) : (
                  <ul className="campaign-list__items">
                    {campaigns.map((campaign) => (
                      <li
                        className={selectedCampaign?.id === campaign.id ? 'campaign-item campaign-item--active' : 'campaign-item'}
                        key={campaign.id}
                      >
                        <div>
                          <span>{campaign.name}</span>
                          <small>{campaign.description ?? 'Без описания'}</small>
                        </div>
                        <div className="campaign-item__meta">
                          <small>{formatTimestamp(campaign.updatedAt)}</small>
                          <button
                            className="button button--secondary"
                            disabled={isStorageBusy}
                            onClick={() => void handleOpenCampaign(campaign.id)}
                            type="button"
                          >
                            Открыть
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {lastError ? <p className="form-status form-status--error">{lastError}</p> : null}
              <p className="muted">{campaignActionStatus}</p>
            </section>

            <PlayerScreenControls
              playerActionStatus={playerActionStatus}
              playerStatus={playerStatus}
              runPlayerAction={runPlayerAction}
            />
          </div>
        </main>

        <aside className="context-panel" aria-label="Правая панель">
          <div className="context-panel__header">
            <div>
              <p className="eyebrow">Library</p>
              <h2>Материалы</h2>
            </div>
            <span className="status-badge status-badge--neutral">Stage 10</span>
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
          {renderRightPanelContent({
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
            canImportAssets: selectedCampaign !== null,
            canUseAssetsInScene: selectedCampaign !== null && activeScene !== null,
            characterActionStatus,
            characterCards,
            characterDraft,
            isStorageBusy,
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
            portraitAssets,
            selectedCharacterCardId,
            totals,
          })}
        </aside>
      </div>
    </>
  )
}

interface PlayerScreenControlsProps {
  playerActionStatus: string
  playerStatus: PlayerScreenStatus
  runPlayerAction(label: string, action: () => Promise<PlayerActionResult>): Promise<void>
}

function PlayerScreenControls({ playerActionStatus, playerStatus, runPlayerAction }: PlayerScreenControlsProps) {
  return (
    <section className="player-control-panel" aria-label="Экран игроков">
      <div className="module-header">
        <div>
          <p className="eyebrow">Player Screen</p>
          <h2>Экран игроков</h2>
        </div>
        <span className={playerStatus.isOpen ? 'status-badge' : 'status-badge status-badge--neutral'}>
          {playerStatus.isOpen ? 'открыт' : 'закрыт'}
        </span>
      </div>

      <div className="control-grid control-grid--dense">
        <button
          className="button"
          type="button"
          onClick={() => void runPlayerAction('Окно игроков открыто.', () => desktopApi.playerScreen.open())}
        >
          Открыть экран игроков
        </button>
        <button
          className="button button--secondary"
          disabled={!playerStatus.isOpen}
          type="button"
          onClick={() => void runPlayerAction('Окно игроков закрыто.', () => desktopApi.playerScreen.close())}
        >
          Закрыть экран игроков
        </button>
        <button
          className="button button--secondary"
          disabled={!playerStatus.isOpen || playerStatus.isFullscreen}
          type="button"
          onClick={() =>
            void runPlayerAction('Окно игроков переведено в fullscreen.', () =>
              desktopApi.playerScreen.setFullscreen(true),
            )
          }
        >
          Fullscreen игрокам
        </button>
        <button
          className="button button--secondary"
          disabled={!playerStatus.isOpen || !playerStatus.isFullscreen}
          type="button"
          onClick={() =>
            void runPlayerAction('Окно игроков выведено из fullscreen.', () =>
              desktopApi.playerScreen.setFullscreen(false),
            )
          }
        >
          Выйти из fullscreen
        </button>
        <button
          className="button"
          type="button"
          onClick={() =>
            void runPlayerAction('Тестовая сцена отправлена игрокам.', () =>
              desktopApi.playerScreen.updateState(createTestSceneState()),
            )
          }
        >
          Показать тестовую сцену
        </button>
        <button
          className="button"
          type="button"
          onClick={() =>
            void runPlayerAction('Тестовое изображение отправлено игрокам.', () =>
              desktopApi.playerScreen.updateState(createTestImageState()),
            )
          }
        >
          Показать тестовое изображение
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void runPlayerAction('Экран игроков скрыт.', () => desktopApi.playerScreen.hide())}
        >
          Скрыть экран игроков
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void runPlayerAction('Экран игроков снова показан.', () => desktopApi.playerScreen.show())}
        >
          Показать экран игроков
        </button>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void runPlayerAction('Экран игроков сброшен.', () => desktopApi.playerScreen.resetState())}
        >
          Сбросить экран игроков
        </button>
      </div>

      <dl className="status-grid status-grid--compact">
        <div>
          <dt>Окно</dt>
          <dd>{playerStatus.isOpen ? 'открыто' : 'закрыто'}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{playerStatus.state.mode}</dd>
        </div>
        <div>
          <dt>Экран</dt>
          <dd>{playerStatus.state.isHidden ? 'скрыт' : 'виден'}</dd>
        </div>
        <div>
          <dt>Fullscreen</dt>
          <dd>{playerStatus.isFullscreen ? 'да' : 'нет'}</dd>
        </div>
        <div>
          <dt>Обновлено</dt>
          <dd>{formatTimestamp(playerStatus.state.updatedAt)}</dd>
        </div>
      </dl>

      <p className="muted">{playerActionStatus}</p>
    </section>
  )
}

interface RightPanelContentProps {
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
  canImportAssets: boolean
  canUseAssetsInScene: boolean
  characterActionStatus: string
  characterCards: CharacterCard[]
  characterDraft: CharacterCardDraft
  isStorageBusy: boolean
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
  portraitAssets: Asset[]
  selectedCharacterCardId: CharacterCardId | null
  totals: { assets: number; characters: number }
}

function renderRightPanelContent(props: RightPanelContentProps) {
  if (props.activeRightPanel === 'assets') {
    return <AssetPanel {...props} />
  }

  if (props.activeRightPanel === 'characters') {
    return <CharacterPanel {...props} />
  }

  return (
    <section className="context-panel__body" role="tabpanel">
      <div className="empty-panel-state">
        <h3>Заметки мастера</h3>
        <p>Место под приватные заметки, handouts и показ артов. Реальное хранение будет позже.</p>
      </div>
      <ul className="compact-list">
        <li>
          <span>Секретные заметки</span>
          <small>Stage 12</small>
        </li>
        <li>
          <span>Письма игрокам</span>
          <small>Stage 12</small>
        </li>
        <li>
          <span>Быстрый показ</span>
          <small>Stage 1</small>
        </li>
      </ul>
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
            <p className="eyebrow">Stage 10</p>
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
                      className="button button--secondary"
                      disabled={!canUseAssetsInScene || isStorageBusy}
                      onClick={() => void onUseAssetInActiveScene(asset.id)}
                      type="button"
                    >
                      В сцену
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

function createTestSceneState(): PlayerScreenState {
  return {
    ...createDefaultPlayerScreenState(),
    mode: 'scene',
    title: 'Тестовая сцена',
    message: 'Зал старого совета готов к показу игрокам.',
    scenePreview: {
      name: 'Зал старого совета',
      description: 'Каменные колонны, длинный стол и тусклые магические огни по периметру.',
      locationLabel: 'Mock scene',
    },
    initiativeVisible: true,
  }
}

function createTestImageState(): PlayerScreenState {
  return {
    ...createDefaultPlayerScreenState(),
    mode: 'image',
    title: 'Тестовое изображение',
    message: 'Handout без реального файла, только проверка канала master → player.',
    handoutPreview: {
      name: 'Герб забытого дома',
      description: 'Серебряный знак на темном фоне, подготовленный как демонстрационный handout.',
      kind: 'image',
      sourceLabel: 'Mock handout',
    },
  }
}

function getActiveSceneFromCampaign(campaign: Campaign) {
  return campaign.scenes.find((scene) => scene.isActive) ?? campaign.scenes[0] ?? null
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
