import { useState, type FormEvent } from 'react'
import type {
  AssetIndexJobStatus,
  AssetLibrarySnapshot,
  CampaignId,
  CampaignSummary,
} from '@shared/types'
import type { CampaignsStore } from '@renderer/stores/useCampaignsStore'
import { useAssetLibraryStore } from '@renderer/stores/useAssetLibraryStore'

interface ProjectStartPageProps {
  campaignsStore: CampaignsStore
  onLaunchProject: (campaignId: CampaignId) => void
}

type ProjectDialog = 'create' | 'delete' | null

export function ProjectStartPage({ campaignsStore, onLaunchProject }: ProjectStartPageProps) {
  const assetLibraryStore = useAssetLibraryStore()
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
  const assetLibrarySource =
    assetLibraryStore.snapshot.sources.find(
      (source) => source.id === assetLibraryStore.snapshot.progress.sourceId,
    ) ??
    assetLibraryStore.snapshot.sources.reduce<(typeof assetLibraryStore.snapshot.sources)[number] | undefined>(
      (latest, source) => (!latest || source.updatedAt > latest.updatedAt ? source : latest),
      undefined,
    )
  const isAssetIndexing =
    assetLibraryStore.snapshot.progress.status === 'running' ||
    assetLibraryStore.snapshot.progress.status === 'cancelling'

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

          <section className="asset-library-connect" aria-label="Общая библиотека изображений">
            <div className="asset-library-connect__header">
              <div>
                <span className="project-actions__kicker">Ассеты</span>
                <h2>Общая библиотека</h2>
              </div>
              <span
                className={`asset-library-connect__badge asset-library-connect__badge--${getAssetLibraryTone(assetLibraryStore.snapshot.progress.status)}`}
              >
                {getAssetLibraryStatusLabel(
                  assetLibraryStore.snapshot.progress.status,
                  assetLibraryStore.snapshot.sources.length,
                )}
              </span>
            </div>
            <p className="asset-library-connect__source" title={assetLibrarySource?.rootPath}>
              {assetLibrarySource?.displayName ?? 'Папка изображений ещё не подключена'}
            </p>
            {isAssetIndexing ? (
              <div className="asset-library-connect__progress">
                <div
                  aria-label="Прогресс индексации"
                  aria-valuemax={Math.max(assetLibraryStore.snapshot.progress.discoveredCount, 1)}
                  aria-valuemin={0}
                  aria-valuenow={assetLibraryStore.snapshot.progress.processedCount}
                  className="asset-library-connect__track"
                  role="progressbar"
                >
                  <span style={{ width: getAssetIndexProgressWidth(assetLibraryStore.snapshot) }} />
                </div>
                <small>
                  {assetLibraryStore.snapshot.progress.processedCount} /{' '}
                  {assetLibraryStore.snapshot.progress.discoveredCount}
                  {assetLibraryStore.snapshot.progress.currentFileName
                    ? ` · ${assetLibraryStore.snapshot.progress.currentFileName}`
                    : ''}
                </small>
              </div>
            ) : (
              <p className="asset-library-connect__summary">
                {assetLibraryStore.snapshot.progress.message ??
                  'Оригиналы остаются на месте; приложение создаёт только каталог и миниатюры.'}
              </p>
            )}
            <div className="asset-library-connect__actions">
              <button
                disabled={isAssetIndexing || assetLibraryStore.status === 'working'}
                onClick={() => void assetLibraryStore.connectDirectory()}
                type="button"
              >
                Подключить папку
              </button>
              {isAssetIndexing ? (
                <button
                  className="asset-library-connect__stop"
                  disabled={assetLibraryStore.snapshot.progress.status === 'cancelling'}
                  onClick={() => void assetLibraryStore.cancelIndexing()}
                  type="button"
                >
                  Остановить
                </button>
              ) : (
                <button
                  disabled={!assetLibrarySource || assetLibraryStore.status === 'working'}
                  onClick={() => assetLibrarySource && void assetLibraryStore.startIndexing(assetLibrarySource.id)}
                  type="button"
                >
                  Пересканировать
                </button>
              )}
            </div>
            {assetLibraryStore.lastError ? (
              <p className="asset-library-connect__error" role="alert">{assetLibraryStore.lastError}</p>
            ) : null}
          </section>

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

function getAssetLibraryTone(status: AssetIndexJobStatus): 'neutral' | 'active' | 'ready' | 'danger' {
  if (status === 'running' || status === 'cancelling') {
    return 'active'
  }
  if (status === 'completed') {
    return 'ready'
  }
  if (status === 'failed') {
    return 'danger'
  }
  return 'neutral'
}

function getAssetLibraryStatusLabel(status: AssetIndexJobStatus, sourceCount: number): string {
  if (status === 'running') {
    return 'Индексация'
  }
  if (status === 'cancelling') {
    return 'Остановка'
  }
  if (status === 'completed') {
    return 'Готово'
  }
  if (status === 'failed') {
    return 'Ошибка'
  }
  return sourceCount > 0 ? `${sourceCount} ${getAssetSourceCountLabel(sourceCount)}` : 'Не подключена'
}

function getAssetIndexProgressWidth(snapshot: AssetLibrarySnapshot): string {
  const { discoveredCount, processedCount } = snapshot.progress
  if (discoveredCount === 0) {
    return '8%'
  }
  return `${Math.max(8, Math.min(100, (processedCount / discoveredCount) * 100))}%`
}

function getAssetSourceCountLabel(count: number): string {
  const lastTwoDigits = count % 100
  const lastDigit = count % 10
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'источников'
  }
  if (lastDigit === 1) {
    return 'источник'
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'источника'
  }
  return 'источников'
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
