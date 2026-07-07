import { useEffect, useMemo, useState } from 'react'
import { desktopApi } from '@renderer/services/desktopApi'
import { useCampaignsStore } from '@renderer/stores/useCampaignsStore'
import {
  createDefaultPlayerScreenState,
  type PlayerScreenCommandResult,
  type PlayerScreenOpenResult,
  type PlayerScreenState,
  type PlayerScreenStatus,
} from '@shared/types'

type PlayerActionResult = PlayerScreenCommandResult | PlayerScreenOpenResult
type RightPanelTab = 'assets' | 'characters' | 'notes'

interface SceneNavigationItem {
  id: string
  title: string
  meta: string
  status: string
  isActive?: boolean
}

interface ToolItem {
  label: string
  shortcut: string
  status: string
}

const sceneNavigationItems: SceneNavigationItem[] = [
  {
    id: 'scene-active',
    title: 'Зал старого совета',
    meta: 'Текущая сцена',
    status: 'preview',
    isActive: true,
  },
  {
    id: 'scene-road',
    title: 'Лесная дорога',
    meta: 'Будущий слот',
    status: 'draft',
  },
  {
    id: 'scene-crypt',
    title: 'Нижний склеп',
    meta: 'Будущий слот',
    status: 'draft',
  },
]

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
  const { campaigns, status, refresh } = useCampaignsStore()
  const [activeRightPanel, setActiveRightPanel] = useState<RightPanelTab>('assets')
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

  const rightPanelTabs: Array<{ id: RightPanelTab; label: string; count: number }> = [
    { id: 'assets', label: 'Ассеты', count: totals.assets },
    { id: 'characters', label: 'Персонажи', count: totals.characters },
    { id: 'notes', label: 'Заметки', count: campaigns.length },
  ]

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
          <p className="muted">Основная рабочая область Stage 2: сцены, инструменты, материалы и экран игроков.</p>
        </div>
        <div className="button-row">
          <span className="status-badge">Этап 2</span>
          <button className="button button--secondary" type="button" onClick={refresh}>
            Обновить
          </button>
        </div>
      </header>

      <section className="scene-strip" aria-label="Сцены">
        <div className="scene-strip__header">
          <span>Сцены</span>
          <span className="muted">Список пока демонстрационный</span>
        </div>
        <div className="scene-strip__items">
          {sceneNavigationItems.map((scene) => (
            <button
              className={scene.isActive ? 'scene-tab scene-tab--active' : 'scene-tab'}
              disabled={!scene.isActive}
              key={scene.id}
              type="button"
            >
              <span>{scene.title}</span>
              <small>{scene.meta}</small>
              <span className="scene-tab__status">{scene.status}</span>
            </button>
          ))}
        </div>
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
                <h2>Рабочая область сцены</h2>
              </div>
              <div className="workspace-board__meta">
                <span>Canvas: next stage</span>
                <span>Player mode: {playerStatus.state.mode}</span>
              </div>
            </div>

            <div className="workspace-board__surface">
              <div className="workspace-board__grid" aria-hidden="true" />
              <div className="workspace-board__empty">
                <span className="status-badge status-badge--neutral">Stage 2 shell</span>
                <h3>Центральная область готова под сцену</h3>
                <p>
                  Здесь позже появятся canvas, карта, сетка и объекты. Сейчас это только стабильный layout для следующих
                  этапов.
                </p>
              </div>
            </div>
          </section>

          <div className="workspace-lower-grid">
            <section className="campaign-summary" aria-label="Кампании">
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
              {campaigns.length === 0 ? (
                <p className="muted">Кампаний пока нет. Слой хранения готов к файлам в `data/campaigns`.</p>
              ) : (
                <ul className="compact-list">
                  {campaigns.map((campaign) => (
                    <li key={campaign.id}>
                      <span>{campaign.name}</span>
                      <small>{campaign.updatedAt}</small>
                    </li>
                  ))}
                </ul>
              )}
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
          {renderRightPanelContent(activeRightPanel, totals)}
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

function renderRightPanelContent(activeRightPanel: RightPanelTab, totals: { assets: number; characters: number }) {
  if (activeRightPanel === 'assets') {
    return (
      <section className="context-panel__body" role="tabpanel">
        <div className="empty-panel-state">
          <h3>Библиотека ассетов</h3>
          <p>Здесь появятся карты, handouts, арты и токены после этапов импорта и библиотеки.</p>
        </div>
        <ul className="compact-list">
          <li>
            <span>Карты</span>
            <small>{totals.assets}</small>
          </li>
          <li>
            <span>Handouts</span>
            <small>Stage 12</small>
          </li>
          <li>
            <span>Токены</span>
            <small>Stage 9</small>
          </li>
        </ul>
      </section>
    )
  }

  if (activeRightPanel === 'characters') {
    return (
      <section className="context-panel__body" role="tabpanel">
        <div className="empty-panel-state">
          <h3>Персонажи и NPC</h3>
          <p>Правая панель уже выделена, но карточки персонажей появятся отдельным этапом.</p>
        </div>
        <ul className="compact-list">
          <li>
            <span>Игроки</span>
            <small>{totals.characters}</small>
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

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}
