import { useMemo, useState } from 'react'
import { useCampaignsStore } from '@renderer/stores/useCampaignsStore'
import { desktopApi } from '@renderer/services/desktopApi'

export function MasterDashboardPage() {
  const { campaigns, status, refresh } = useCampaignsStore()
  const [playerScreenStatus, setPlayerScreenStatus] = useState<'idle' | 'opening' | 'opened' | 'unavailable'>('idle')

  const totals = useMemo(
    () => ({
      scenes: campaigns.reduce((sum, campaign) => sum + campaign.sceneCount, 0),
      assets: campaigns.reduce((sum, campaign) => sum + campaign.assetCount, 0),
      characters: campaigns.reduce((sum, campaign) => sum + campaign.characterCount, 0),
    }),
    [campaigns],
  )

  async function openPlayerScreen(): Promise<void> {
    setPlayerScreenStatus('opening')
    const result = await desktopApi.playerScreen.open()
    setPlayerScreenStatus(result.opened ? 'opened' : 'unavailable')
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
          <button className="button" type="button" onClick={() => void openPlayerScreen()}>
            Открыть экран игроков
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
                <span className="status-badge">
                  {playerScreenStatus === 'opening'
                    ? 'открытие'
                    : playerScreenStatus === 'opened'
                      ? 'открыто'
                      : playerScreenStatus === 'unavailable'
                        ? 'недоступно'
                        : 'подготовлено'}
                </span>
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
