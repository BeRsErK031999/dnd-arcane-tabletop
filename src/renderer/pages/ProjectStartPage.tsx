import { useState, type FormEvent } from 'react'
import type { CampaignId, CampaignSummary } from '@shared/types'
import type { CampaignsStore } from '@renderer/stores/useCampaignsStore'

interface ProjectStartPageProps {
  campaignsStore: CampaignsStore
  onLaunchProject: (campaignId: CampaignId) => void
}

type ProjectDialog = 'create' | 'delete' | null

export function ProjectStartPage({ campaignsStore, onLaunchProject }: ProjectStartPageProps) {
  const {
    campaigns,
    campaignsDirectory,
    selectedCampaign,
    status,
    lastError,
    refresh,
    createCampaign,
    openCampaign,
    deleteSelectedCampaign,
    importProject,
    exportSelectedProject,
  } = campaignsStore
  const [dialog, setDialog] = useState<ProjectDialog>(null)
  const [projectName, setProjectName] = useState('')
  const [projectDescription, setProjectDescription] = useState('')
  const [actionMessage, setActionMessage] = useState(() =>
    selectedCampaign
      ? `Проект «${selectedCampaign.name}» выбран.`
      : 'Выберите проект, чтобы открыть рабочую область.',
  )
  const isBusy = status === 'loading' || status === 'saving' || status === 'deleting'

  async function selectProject(campaignId: CampaignId): Promise<boolean> {
    if (selectedCampaign?.id === campaignId) {
      return true
    }

    const result = await openCampaign(campaignId)

    if (!result.ok) {
      setActionMessage('Не удалось загрузить выбранный проект.')
      return false
    }

    setActionMessage(`Проект «${result.campaign.name}» выбран.`)
    return true
  }

  async function launchProject(campaignId: CampaignId): Promise<void> {
    if (await selectProject(campaignId)) {
      onLaunchProject(campaignId)
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const result = await createCampaign(projectName, projectDescription)

    if (!result.ok) {
      setActionMessage('Не удалось создать проект.')
      return
    }

    setProjectName('')
    setProjectDescription('')
    setDialog(null)
    onLaunchProject(result.campaign.id)
  }

  async function handleDeleteProject(): Promise<void> {
    const projectNameToDelete = selectedCampaign?.name

    if (!projectNameToDelete) {
      setDialog(null)
      return
    }

    if (await deleteSelectedCampaign()) {
      setActionMessage(`Проект «${projectNameToDelete}» удалён. Локальные ассеты сохранены.`)
      setDialog(null)
      return
    }

    setActionMessage('Не удалось удалить проект.')
  }

  async function handleImportProject(): Promise<void> {
    const result = await importProject()

    if (!result.ok) {
      if (result.reason === 'cancelled') {
        setActionMessage('Импорт проекта отменён.')
      }
      return
    }

    setActionMessage(
      result.campaignIdChanged
        ? `Проект «${result.campaign.name}» импортирован с новым внутренним ID.`
        : `Проект «${result.campaign.name}» импортирован и выбран.`,
    )
  }

  async function handleExportProject(): Promise<void> {
    const result = await exportSelectedProject()

    if (!result.ok) {
      if (result.reason === 'cancelled') {
        setActionMessage('Экспорт проекта отменён.')
      }
      return
    }

    setActionMessage(
      `Проект экспортирован: ${result.exportedAssetCount} ${getAssetCountLabel(result.exportedAssetCount)} в автономном пакете.`,
    )
  }

  return (
    <main className="project-start" aria-label="Стартовый экран проектов">
      <div className="project-start__glow project-start__glow--top" aria-hidden="true" />
      <div className="project-start__glow project-start__glow--bottom" aria-hidden="true" />

      <header className="project-start__header">
        <div className="project-start__brand" aria-label="D&D Arcane Tabletop">
          <span className="project-start__brand-mark" aria-hidden="true">D20</span>
          <div>
            <p>D&amp;D Arcane Tabletop</p>
            <span>Game builder</span>
          </div>
        </div>
        <div className="project-start__storage">
          <span>Локальное хранилище</span>
          <strong title={campaignsDirectory?.path}>{campaignsDirectory?.path ?? 'Подключение...'}</strong>
        </div>
      </header>

      <div className="project-start__layout">
        <aside className="project-actions" aria-label="Действия с проектами">
          <div className="project-actions__intro">
            <span className="project-actions__kicker">Мастерская кампаний</span>
            <h1>Подготовьте стол к приключению</h1>
            <p>Выберите сохранённый проект или начните новую кампанию. Все данные остаются на этом компьютере.</p>
          </div>

          <div className="project-actions__buttons">
            <button
              className="project-action project-action--primary"
              disabled={selectedCampaign === null || isBusy}
              onClick={() => selectedCampaign && void launchProject(selectedCampaign.id)}
              type="button"
            >
              <span className="project-action__icon" aria-hidden="true">▶</span>
              <span>Запустить проект</span>
            </button>
            <button
              className="project-action"
              disabled={isBusy}
              onClick={() => setDialog('create')}
              type="button"
            >
              <span className="project-action__icon" aria-hidden="true">＋</span>
              <span>Создать проект</span>
            </button>
            <button
              className="project-action"
              disabled={isBusy}
              onClick={() => void handleImportProject()}
              title="Импортировать автономный .arcane-campaign пакет"
              type="button"
            >
              <span className="project-action__icon" aria-hidden="true">⇣</span>
              <span>Импорт проекта</span>
            </button>
            <button
              className="project-action"
              disabled={selectedCampaign === null || isBusy}
              onClick={() => void handleExportProject()}
              title="Экспортировать выбранный проект в .arcane-campaign"
              type="button"
            >
              <span className="project-action__icon" aria-hidden="true">⇡</span>
              <span>Экспорт проекта</span>
            </button>
            <button
              className="project-action project-action--danger"
              disabled={selectedCampaign === null || isBusy}
              onClick={() => setDialog('delete')}
              type="button"
            >
              <span className="project-action__icon" aria-hidden="true">×</span>
              <span>Удалить проект</span>
            </button>
          </div>

          <p className={lastError ? 'project-actions__status project-actions__status--error' : 'project-actions__status'}>
            {lastError ?? actionMessage}
          </p>
        </aside>

        <section className="project-library" aria-label="Загруженные проекты">
          <div className="project-library__header">
            <div>
              <span className="project-actions__kicker">Проекты</span>
              <h2>Ваша библиотека</h2>
            </div>
            <div className="project-library__meta">
              <span>{campaigns.length} {getProjectCountLabel(campaigns.length)}</span>
              <button
                aria-label="Обновить список проектов"
                disabled={isBusy}
                onClick={() => void refresh()}
                title="Обновить"
                type="button"
              >
                ↻
              </button>
            </div>
          </div>

          <div className="project-library__scroll" aria-busy={isBusy}>
            {status === 'loading' && campaigns.length === 0 ? (
              <div className="project-library__empty">
                <span className="project-library__empty-mark" aria-hidden="true">⌛</span>
                <h3>Загружаем проекты</h3>
                <p>Читаем локальную библиотеку кампаний.</p>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="project-library__empty">
                <span className="project-library__empty-mark" aria-hidden="true">✦</span>
                <h3>Библиотека пока пуста</h3>
                <p>Создайте первый проект — он появится здесь с превью активной карты.</p>
                <button className="project-start__empty-action" onClick={() => setDialog('create')} type="button">
                  Создать проект
                </button>
              </div>
            ) : (
              <ul className="project-grid">
                {campaigns.map((campaign) => (
                  <ProjectCard
                    campaign={campaign}
                    disabled={isBusy}
                    isSelected={selectedCampaign?.id === campaign.id}
                    key={campaign.id}
                    onSelect={() => void selectProject(campaign.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {dialog === 'create' ? (
        <div className="project-dialog-backdrop" role="presentation">
          <section aria-labelledby="create-project-title" aria-modal="true" className="project-dialog" role="dialog">
            <button
              aria-label="Закрыть окно создания проекта"
              className="project-dialog__close"
              onClick={() => setDialog(null)}
              type="button"
            >
              ×
            </button>
            <span className="project-actions__kicker">Новая кампания</span>
            <h2 id="create-project-title">Создать проект</h2>
            <p>Название можно изменить позже. Новый проект откроется сразу после создания.</p>
            <form className="project-dialog__form" onSubmit={(event) => void handleCreateProject(event)}>
              <label>
                <span>Название проекта</span>
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Например: Тайна Чёрного грота"
                  value={projectName}
                />
              </label>
              <label>
                <span>Краткое описание</span>
                <textarea
                  maxLength={500}
                  onChange={(event) => setProjectDescription(event.target.value)}
                  placeholder="Заметка для мастера"
                  rows={4}
                  value={projectDescription}
                />
              </label>
              <div className="project-dialog__actions">
                <button className="project-dialog__secondary" onClick={() => setDialog(null)} type="button">
                  Отмена
                </button>
                <button className="project-dialog__primary" disabled={isBusy} type="submit">
                  {isBusy ? 'Создаём...' : 'Создать и открыть'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {dialog === 'delete' && selectedCampaign ? (
        <div className="project-dialog-backdrop" role="presentation">
          <section aria-labelledby="delete-project-title" aria-modal="true" className="project-dialog" role="alertdialog">
            <span className="project-actions__kicker project-actions__kicker--danger">Удаление проекта</span>
            <h2 id="delete-project-title">Удалить «{selectedCampaign.name}»?</h2>
            <p>JSON проекта и резервные копии будут удалены. Загруженные файлы ассетов останутся на диске.</p>
            <div className="project-dialog__actions">
              <button className="project-dialog__secondary" onClick={() => setDialog(null)} type="button">
                Отмена
              </button>
              <button
                className="project-dialog__danger"
                disabled={isBusy}
                onClick={() => void handleDeleteProject()}
                type="button"
              >
                {isBusy ? 'Удаляем...' : 'Удалить проект'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}

interface ProjectCardProps {
  campaign: CampaignSummary
  disabled: boolean
  isSelected: boolean
  onSelect: () => void
}

function ProjectCard({ campaign, disabled, isSelected, onSelect }: ProjectCardProps) {
  return (
    <li>
      <button
        aria-pressed={isSelected}
        className={isSelected ? 'project-card project-card--selected' : 'project-card'}
        disabled={disabled}
        onClick={onSelect}
        type="button"
      >
        <span className="project-card__preview">
          {campaign.previewImagePath ? (
            <img alt="" src={campaign.previewImagePath} />
          ) : (
            <span className="project-card__placeholder" aria-hidden="true">
              <span>◈</span>
              <small>Превью появится после выбора карты сцены</small>
            </span>
          )}
          <span className="project-card__selected-mark" aria-hidden="true">✓</span>
        </span>
        <span className="project-card__content">
          <strong>{campaign.name}</strong>
          <span>{campaign.description ?? 'Без описания'}</span>
          <small>
            {campaign.sceneCount} сцен · {campaign.assetCount} ассетов · {formatProjectDate(campaign.updatedAt)}
          </small>
        </span>
      </button>
    </li>
  )
}

function formatProjectDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'дата не указана'
  }

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function getProjectCountLabel(count: number): string {
  const normalized = Math.abs(count) % 100
  const lastDigit = normalized % 10

  if (normalized > 10 && normalized < 20) {
    return 'проектов'
  }

  if (lastDigit === 1) {
    return 'проект'
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'проекта'
  }

  return 'проектов'
}

function getAssetCountLabel(count: number): string {
  const normalized = Math.abs(count) % 100
  const lastDigit = normalized % 10

  if (normalized > 10 && normalized < 20) {
    return 'ассетов'
  }

  if (lastDigit === 1) {
    return 'ассет'
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'ассета'
  }

  return 'ассетов'
}
