import { useEffect, useMemo, useState } from 'react'
import { useCampaignsStore } from '@renderer/stores/useCampaignsStore'
import { desktopApi } from '@renderer/services/desktopApi'
import {
  createDefaultPlayerScreenState,
  type PlayerScreenCommandResult,
  type PlayerScreenOpenResult,
  type PlayerScreenState,
  type PlayerScreenStatus,
} from '@shared/types'

type PlayerActionResult = PlayerScreenCommandResult | PlayerScreenOpenResult

export function MasterDashboardPage() {
  const { campaigns, status, refresh } = useCampaignsStore()
  const [playerStatus, setPlayerStatus] = useState<PlayerScreenStatus>(() => ({
    isOpen: false,
    isFullscreen: false,
    state: createDefaultPlayerScreenState(),
  }))
  const [playerActionStatus, setPlayerActionStatus] = useState('Готов к управлению экраном игроков.')

  const totals = useMemo(
    () => ({
      scenes: campaigns.reduce((sum, campaign) => sum + campaign.sceneCount, 0),
      assets: campaigns.reduce((sum, campaign) => sum + campaign.assetCount, 0),
      characters: campaigns.reduce((sum, campaign) => sum + campaign.characterCount, 0),
    }),
    [campaigns],
  )

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
      <header className="page-header">
        <div>
          <p className="eyebrow">Master Console</p>
          <h1>Панель мастера</h1>
          <p className="muted">Кампании хранятся локально в JSON-файлах, без backend и аккаунтов.</p>
        </div>
        <div className="button-row">
          <button className="button button--secondary" type="button" onClick={refresh}>
            Обновить
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel__header">
            <h2>Кампании</h2>
            <span className="status-badge">{status === 'loading' ? 'Загрузка' : 'JSON'}</span>
          </div>
          <div className="panel__body stack">
            <div className="metric-grid">
              <div className="metric">
                <span className="metric__value">{campaigns.length}</span>
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
              <div className="empty-state">
                <div>
                  <h3>Кампаний пока нет</h3>
                  <p>Слой хранения готов к работе с файлами в `data/campaigns`.</p>
                </div>
              </div>
            ) : (
              <ul className="status-list">
                {campaigns.map((campaign) => (
                  <li className="status-item" key={campaign.id}>
                    <span>{campaign.name}</span>
                    <span className="muted">{campaign.updatedAt}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <h2>Экран игроков</h2>
            <span className={playerStatus.isOpen ? 'status-badge' : 'status-badge status-badge--neutral'}>
              {playerStatus.isOpen ? 'открыт' : 'закрыт'}
            </span>
          </div>
          <div className="panel__body stack">
            <div className="control-grid">
              <button
                className="button"
                type="button"
                onClick={() =>
                  void runPlayerAction('Окно игроков открыто.', () => desktopApi.playerScreen.open())
                }
              >
                Открыть экран игроков
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={!playerStatus.isOpen}
                onClick={() =>
                  void runPlayerAction('Окно игроков закрыто.', () => desktopApi.playerScreen.close())
                }
              >
                Закрыть экран игроков
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={!playerStatus.isOpen || playerStatus.isFullscreen}
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
                type="button"
                disabled={!playerStatus.isOpen || !playerStatus.isFullscreen}
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
                onClick={() =>
                  void runPlayerAction('Экран игроков скрыт.', () => desktopApi.playerScreen.hide())
                }
              >
                Скрыть экран игроков
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={() =>
                  void runPlayerAction('Экран игроков снова показан.', () => desktopApi.playerScreen.show())
                }
              >
                Показать экран игроков
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={() =>
                  void runPlayerAction('Экран игроков сброшен.', () => desktopApi.playerScreen.resetState())
                }
              >
                Сбросить экран игроков
              </button>
            </div>

            <dl className="status-grid">
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
          </div>
        </section>

        <aside className="panel">
          <div className="panel__header">
            <h2>Архитектура</h2>
            <span className="status-badge">Этап 1</span>
          </div>
          <div className="panel__body">
            <ul className="status-list">
              <li className="status-item">
                <span>Electron shell</span>
                <span className="status-badge">готово</span>
              </li>
              <li className="status-item">
                <span>React renderer</span>
                <span className="status-badge">готово</span>
              </li>
              <li className="status-item">
                <span>StorageService</span>
                <span className="status-badge">JSON</span>
              </li>
              <li className="status-item">
                <span>Player window</span>
                <span className="status-badge">{playerStatus.isOpen ? 'открыто' : 'подготовлено'}</span>
              </li>
              <li className="status-item">
                <span>Assets</span>
                <span className="muted">{totals.assets}</span>
              </li>
            </ul>
          </div>
        </aside>
      </div>
    </>
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
