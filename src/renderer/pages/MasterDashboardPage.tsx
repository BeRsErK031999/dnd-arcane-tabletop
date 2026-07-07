import { useEffect, useMemo, useState } from 'react'
import { desktopApi } from '@renderer/services/desktopApi'
import { useCampaignsStore } from '@renderer/stores/useCampaignsStore'
import {
  createDefaultPlayerScreenState,
  type Asset,
  type AssetId,
  type ImageAssetKind,
  type PlayerScreenCommandResult,
  type PlayerScreenOpenResult,
  type PlayerScreenState,
  type PlayerScreenStatus,
} from '@shared/types'

type PlayerActionResult = PlayerScreenCommandResult | PlayerScreenOpenResult
type RightPanelTab = 'assets' | 'characters' | 'notes'

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
      { label: 'Панорама', shortcut: 'Space', status: 'soon' },
      { label: 'Масштаб', shortcut: 'Z', status: 'soon' },
    ],
  },
  {
    title: 'Сцена',
    items: [
      { label: 'Сетка', shortcut: 'G', status: 'soon' },
      { label: 'Измерение', shortcut: 'M', status: 'soon' },
      { label: 'Область', shortcut: 'A', status: 'soon' },
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
    importImageAsset,
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
  const [assetName, setAssetName] = useState('')
  const [assetActionStatus, setAssetActionStatus] = useState('Откройте кампанию, чтобы импортировать изображения.')
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

  const rightPanelTabs: Array<{ id: RightPanelTab; label: string; count: number }> = [
    { id: 'assets', label: 'Ассеты', count: selectedCampaign?.assets.length ?? totals.assets },
    { id: 'characters', label: 'Персонажи', count: totals.characters },
    { id: 'notes', label: 'Заметки', count: selectedCampaign?.notes.length ?? 0 },
  ]

  const isStorageBusy = status === 'loading' || status === 'saving' || status === 'deleting'

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
  }, [selectedCampaign])

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

  async function handleImportImageAsset(): Promise<void> {
    const result = await importImageAsset(assetKind, assetName)

    if (result.ok) {
      const asset = result.campaign.assets.find((candidate) => candidate.id === result.assetId)
      setAssetName('')
      setAssetActionStatus(`Изображение "${asset?.name ?? 'без названия'}" импортировано.`)

      if (asset?.kind === 'map') {
        setSceneActionStatus(`Карта "${asset.name}" привязана к активной сцене.`)
      }

      return
    }

    setAssetActionStatus(result.reason === 'cancelled' ? 'Импорт изображения отменен.' : 'Не удалось импортировать изображение.')
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
          <p className="muted">Stage 5: карты и изображения через локальный импорт assets.</p>
        </div>
        <div className="button-row">
          {selectedCampaign ? <span className="status-badge">Открыта: {selectedCampaign.name}</span> : null}
          <span className="status-badge">Этап 5</span>
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
                <span>Canvas: Stage 6</span>
                <span>Player mode: {playerStatus.state.mode}</span>
              </div>
            </div>

            <div className="workspace-board__surface">
              <div className="workspace-board__grid" aria-hidden="true" />
              <div className="workspace-board__empty workspace-board__empty--scene">
                {activeScene ? (
                  <>
                    <span className="status-badge">Активная сцена</span>
                    <h3>{activeScene.name}</h3>
                    <p>{activeScene.description ?? 'Описание можно добавить при создании следующей сцены.'}</p>
                    <dl className="scene-detail-grid">
                      <div>
                        <dt>Сетка</dt>
                        <dd>{activeScene.grid.enabled ? `${activeScene.grid.size}px` : 'выключена'}</dd>
                      </div>
                      <div>
                        <dt>Токены</dt>
                        <dd>{activeScene.tokens.length}</dd>
                      </div>
                      <div>
                        <dt>Карта</dt>
                        <dd>{activeMapAsset?.name ?? 'не привязана'}</dd>
                      </div>
                      <div>
                        <dt>Player preview</dt>
                        <dd>{playerStatus.state.activeSceneId === activeScene.id ? 'синхронизирован' : 'не отправлен'}</dd>
                      </div>
                    </dl>
                    {activeMapAsset ? (
                      <figure className="scene-map-preview">
                        <img alt="" src={activeMapAsset.filePath} />
                        <figcaption>{activeMapAsset.name}</figcaption>
                      </figure>
                    ) : null}
                    <button className="button" disabled={isStorageBusy} onClick={() => void handleSendActiveSceneToPlayers()} type="button">
                      Показать активную сцену игрокам
                    </button>
                  </>
                ) : (
                  <>
                    <span className="status-badge status-badge--neutral">Stage 4</span>
                    <h3>Сцена не выбрана</h3>
                    <p>
                      Откройте кампанию и создайте первую сцену. Canvas, карта, токены и fog of war останутся будущими
                      этапами.
                    </p>
                  </>
                )}
              </div>
            </div>
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
            <span className="status-badge status-badge--neutral">placeholder</span>
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
            assetKind,
            assetName,
            assets: selectedCampaign?.assets ?? [],
            canImportAssets: selectedCampaign !== null,
            isStorageBusy,
            onAssetKindChange: setAssetKind,
            onAssetNameChange: setAssetName,
            onImportImageAsset: handleImportImageAsset,
            onSendAssetToPlayers: handleSendAssetToPlayers,
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
  assetKind: ImageAssetKind
  assetName: string
  assets: Asset[]
  canImportAssets: boolean
  isStorageBusy: boolean
  onAssetKindChange(kind: ImageAssetKind): void
  onAssetNameChange(name: string): void
  onImportImageAsset(): Promise<void>
  onSendAssetToPlayers(assetId: AssetId): Promise<void>
  totals: { assets: number; characters: number }
}

function renderRightPanelContent(props: RightPanelContentProps) {
  if (props.activeRightPanel === 'assets') {
    return <AssetPanel {...props} />
  }

  if (props.activeRightPanel === 'characters') {
    return (
      <section className="context-panel__body" role="tabpanel">
        <div className="empty-panel-state">
          <h3>Персонажи и NPC</h3>
          <p>Правая панель уже выделена, но карточки персонажей появятся отдельным этапом.</p>
        </div>
        <ul className="compact-list">
          <li>
            <span>Игроки</span>
            <small>{props.totals.characters}</small>
          </li>
          <li>
            <span>NPC</span>
            <small>Stage 10</small>
          </li>
          <li>
            <span>Монстры</span>
            <small>Stage 10</small>
          </li>
        </ul>
      </section>
    )
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

function AssetPanel({
  assetActionStatus,
  assetKind,
  assetName,
  assets,
  canImportAssets,
  isStorageBusy,
  onAssetKindChange,
  onAssetNameChange,
  onImportImageAsset,
  onSendAssetToPlayers,
}: RightPanelContentProps) {
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
        <ul className="asset-list">
          {assets.map((asset) => (
            <li className="asset-item" key={asset.id}>
              <div className="asset-thumb">
                <img alt="" src={asset.filePath} />
              </div>
              <div>
                <span>{asset.name}</span>
                <small>{getAssetKindLabel(asset.kind)}</small>
              </div>
              <button
                className="button button--secondary"
                disabled={isStorageBusy}
                onClick={() => void onSendAssetToPlayers(asset.id)}
                type="button"
              >
                Показать
              </button>
            </li>
          ))}
        </ul>
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

function getAssetKindLabel(kind: Asset['kind']): string {
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
