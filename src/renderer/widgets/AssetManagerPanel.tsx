import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { desktopApi } from '@renderer/services/desktopApi'
import { normalizeAssetTags } from '@renderer/stores/assetFactory'
import { useAssetLibraryStore } from '@renderer/stores/useAssetLibraryStore'
import type {
  Asset,
  AssetLibraryItem,
  AssetLibraryPage,
  AssetLibraryQuery,
  Campaign,
  CampaignAssetExportPolicy,
  ImageAssetKind,
  IndexedAssetAvailability,
} from '@shared/types'
import { calculateAssetGridWindow } from './assetManagerVirtualization'
import './AssetManagerPanel.css'

const queryLimit = 2_000
const supportedFormats = ['png', 'jpeg', 'webp', 'gif', 'avif'] as const

type AssetSizeFilter = 'all' | 'small' | 'medium' | 'large'
type AvailabilityFilter = 'all' | IndexedAssetAvailability

interface AssetManagerPanelProps {
  campaign: Campaign | null
  isCampaignBusy: boolean
  onSelectAsset(
    asset: AssetLibraryItem,
    kind: ImageAssetKind,
    exportPolicy: CampaignAssetExportPolicy,
  ): Promise<{ ok: boolean }>
}

const emptyPage: AssetLibraryPage = {
  items: [],
  total: 0,
  offset: 0,
  limit: queryLimit,
}

export function AssetManagerPanel({ campaign, isCampaignBusy, onSelectAsset }: AssetManagerPanelProps) {
  const libraryStore = useAssetLibraryStore()
  const [page, setPage] = useState<AssetLibraryPage>(emptyPage)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 220)
  const [sourceId, setSourceId] = useState('all')
  const [format, setFormat] = useState('all')
  const [sizeFilter, setSizeFilter] = useState<AssetSizeFilter>('all')
  const [availability, setAvailability] = useState<AvailabilityFilter>('all')
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [tagDraft, setTagDraft] = useState('')
  const [campaignKind, setCampaignKind] = useState<ImageAssetKind>('other')
  const [alwaysExport, setAlwaysExport] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingTags, setIsSavingTags] = useState(false)
  const [isMaintenanceBusy, setIsMaintenanceBusy] = useState(false)
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState('Выберите ассет, чтобы посмотреть детали.')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [previewErrors, setPreviewErrors] = useState<Set<string>>(() => new Set())
  const requestIdRef = useRef(0)
  const reloadedScanRef = useRef<string | undefined>(undefined)

  const query = useMemo<AssetLibraryQuery>(
    () => ({
      sourceIds: sourceId === 'all' ? undefined : [sourceId],
      search: debouncedSearch || undefined,
      formats: format === 'all' ? undefined : [format],
      availability: availability === 'all' ? undefined : [availability],
      ...getSizeQuery(sizeFilter),
      offset: 0,
      limit: queryLimit,
    }),
    [availability, debouncedSearch, format, sizeFilter, sourceId],
  )

  const loadAssets = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setLoadError(null)
    try {
      const nextPage = await desktopApi.assetLibrary.queryAssets(query)
      if (requestId === requestIdRef.current) {
        setPage(nextPage)
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setLoadError('Не удалось загрузить индекс общей библиотеки.')
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    void loadAssets()
  }, [loadAssets])

  useEffect(() => {
    const finishedAt = libraryStore.snapshot.progress.finishedAt
    if (
      libraryStore.snapshot.progress.status !== 'completed' ||
      !finishedAt ||
      reloadedScanRef.current === finishedAt
    ) return
    reloadedScanRef.current = finishedAt
    void loadAssets()
  }, [libraryStore.snapshot.progress.finishedAt, libraryStore.snapshot.progress.status, loadAssets])

  const selectedAsset = useMemo(
    () => page.items.find((asset) => asset.id === selectedAssetId) ?? null,
    [page.items, selectedAssetId],
  )
  const campaignAsset = selectedAsset ? findCampaignAsset(campaign, selectedAsset.id) : null

  useEffect(() => {
    if (!selectedAsset) {
      return
    }
    setTagDraft(selectedAsset.tags.join(', '))
    setCampaignKind(campaignAsset && isImageAssetKind(campaignAsset.kind) ? campaignAsset.kind : inferAssetKind(selectedAsset))
    setAlwaysExport(campaignAsset?.exportPolicy === 'always')
  }, [campaignAsset, selectedAsset])

  useEffect(() => {
    if (selectedAssetId && !page.items.some((asset) => asset.id === selectedAssetId)) {
      setSelectedAssetId(null)
    }
  }, [page.items, selectedAssetId])

  const sourcesById = useMemo(
    () => new Map(libraryStore.snapshot.sources.map((source) => [source.id, source])),
    [libraryStore.snapshot.sources],
  )
  const sourceForRescan =
    libraryStore.snapshot.sources.find((source) => source.id === sourceId) ??
    libraryStore.snapshot.sources.find((source) => source.id === libraryStore.snapshot.progress.sourceId) ??
    libraryStore.snapshot.sources[0]
  const isIndexing =
    libraryStore.snapshot.progress.status === 'running' ||
    libraryStore.snapshot.progress.status === 'cancelling'
  const hasFilters =
    search.trim() !== '' || sourceId !== 'all' || format !== 'all' || sizeFilter !== 'all' || availability !== 'all'

  function selectAsset(asset: AssetLibraryItem): void {
    setSelectedAssetId(asset.id)
    setActionMessage(
      asset.availability === 'available'
        ? 'Можно изменить теги или добавить ассет в открытую кампанию.'
        : 'Исходный файл недоступен, но пользовательские теги можно редактировать.',
    )
  }

  async function saveTags(): Promise<void> {
    if (!selectedAsset) {
      return
    }
    setIsSavingTags(true)
    const tags = normalizeAssetTags(tagDraft)
    try {
      const result = await desktopApi.assetLibrary.updateTags(selectedAsset.id, tags)
      if (!result.ok) {
        setActionMessage(
          result.reason === 'desktop-api-unavailable'
            ? 'Редактирование каталога доступно в настольном приложении.'
            : 'Не удалось сохранить теги в SQLite-каталоге.',
        )
        return
      }
      setPage((currentPage) => ({
        ...currentPage,
        items: currentPage.items.map((asset) => (asset.id === result.asset.id ? result.asset : asset)),
      }))
      setTagDraft(result.asset.tags.join(', '))
      setActionMessage('Теги сохранены. Исходный файл не изменялся.')
    } catch {
      setActionMessage('Не удалось сохранить теги в SQLite-каталоге.')
    } finally {
      setIsSavingTags(false)
    }
  }

  async function selectForCampaign(): Promise<void> {
    if (!selectedAsset || !campaign || !selectedAsset.sha256) {
      return
    }
    setActionMessage('Сохраняем выбор в кампании…')
    const result = await onSelectAsset(
      selectedAsset,
      campaignKind,
      alwaysExport ? 'always' : 'when-used',
    )
    setActionMessage(
      result.ok
        ? alwaysExport
          ? 'Ассет сохранён в управляемом хранилище и всегда будет включаться в автономный экспорт.'
          : 'Ассет сохранён в управляемом хранилище и будет экспортироваться при использовании.'
        : 'Не удалось сохранить выбор ассета в кампании.',
    )
  }

  async function collectUnusedManagedAssets(): Promise<void> {
    setIsMaintenanceBusy(true)
    setMaintenanceMessage('Проверяем ссылки кампаний…')
    try {
      const preview = await desktopApi.assetLibrary.previewGarbageCollection()
      if (!preview.ok) {
        setMaintenanceMessage('Не удалось проверить управляемое хранилище.')
        return
      }
      if (preview.plan.candidates.length === 0) {
        setMaintenanceMessage('Неиспользуемых файлов нет — очистка не требуется.')
        return
      }

      const confirmed = window.confirm(
        `Удалить ${preview.plan.candidates.length} неиспользуемых файлов (${formatFileSize(preview.plan.totalByteSize)})? Используемые кампаниями файлы затронуты не будут.`,
      )
      if (!confirmed) {
        setMaintenanceMessage('Очистка отменена. Файлы не изменялись.')
        return
      }

      const result = await desktopApi.assetLibrary.collectGarbage(preview.plan.token)
      setMaintenanceMessage(
        result.ok
          ? `Удалено файлов: ${result.deletedSha256.length}, пропущено: ${result.skippedSha256.length}, освобождено ${formatFileSize(result.reclaimedByteSize)}.`
          : 'План очистки устарел или хранилище недоступно.',
      )
    } catch {
      setMaintenanceMessage('Не удалось завершить очистку управляемого хранилища.')
    } finally {
      setIsMaintenanceBusy(false)
    }
  }

  function resetFilters(): void {
    setSearch('')
    setSourceId('all')
    setFormat('all')
    setSizeFilter('all')
    setAvailability('all')
  }

  return (
    <section className="asset-manager" aria-label="Asset Manager">
      <header className="asset-manager__header">
        <div>
          <p className="eyebrow">Asset Manager</p>
          <h2>Общая библиотека</h2>
          <p>Индексированные изображения из подключённых папок. Оригиналы остаются на месте.</p>
        </div>
        <div className="asset-manager__header-actions">
          <span className={isIndexing ? 'status-badge status-badge--warning' : 'status-badge'}>
            {isIndexing ? getIndexingStatus(libraryStore.snapshot.progress.status) : `${page.total} файлов`}
          </span>
          <button
            className="button button--secondary"
            disabled={isIndexing || libraryStore.status === 'working' || isMaintenanceBusy}
            onClick={() => void libraryStore.connectDirectory()}
            type="button"
          >
            Подключить папку
          </button>
          {isIndexing ? (
            <button
              className="button button--danger"
              disabled={libraryStore.snapshot.progress.status === 'cancelling'}
              onClick={() => void libraryStore.cancelIndexing()}
              type="button"
            >
              Остановить
            </button>
          ) : (
            <button
              className="button button--secondary"
              disabled={!sourceForRescan || libraryStore.status === 'working' || isMaintenanceBusy}
              onClick={() => sourceForRescan && void libraryStore.startIndexing(sourceForRescan.id)}
              type="button"
            >
              Пересканировать
            </button>
          )}
          <button
            className="button button--secondary"
            disabled={isIndexing || isMaintenanceBusy}
            onClick={() => void collectUnusedManagedAssets()}
            title="Удалить только файлы, на которые не ссылается ни одна кампания"
            type="button"
          >
            {isMaintenanceBusy ? 'Проверяем…' : 'Очистить хранилище'}
          </button>
        </div>
      </header>

      {maintenanceMessage ? (
        <p className="asset-manager__maintenance" role="status">{maintenanceMessage}</p>
      ) : null}

      {isIndexing ? (
        <div className="asset-manager-indexing" aria-live="polite">
          <div>
            <strong>{libraryStore.snapshot.progress.message}</strong>
            <span>
              {libraryStore.snapshot.progress.processedCount} из {libraryStore.snapshot.progress.discoveredCount}
              {libraryStore.snapshot.progress.currentFileName
                ? ` · ${libraryStore.snapshot.progress.currentFileName}`
                : ''}
            </span>
          </div>
          <div className="asset-manager-indexing__track">
            <span style={{ width: getProgressWidth(libraryStore.snapshot.progress) }} />
          </div>
        </div>
      ) : null}

      <div className="asset-manager-filters" aria-label="Фильтры библиотеки">
        <label className="asset-manager-filters__search">
          <span>Поиск</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Имя файла, путь или тег"
            type="search"
            value={search}
          />
        </label>
        <label>
          <span>Источник</span>
          <select onChange={(event) => setSourceId(event.target.value)} value={sourceId}>
            <option value="all">Все папки</option>
            {libraryStore.snapshot.sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Формат</span>
          <select onChange={(event) => setFormat(event.target.value)} value={format}>
            <option value="all">Все</option>
            {supportedFormats.map((value) => (
              <option key={value} value={value}>
                {value.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Размер</span>
          <select onChange={(event) => setSizeFilter(event.target.value as AssetSizeFilter)} value={sizeFilter}>
            <option value="all">Любой</option>
            <option value="small">До 1 МБ</option>
            <option value="medium">1–10 МБ</option>
            <option value="large">Больше 10 МБ</option>
          </select>
        </label>
        <label>
          <span>Доступность</span>
          <select
            onChange={(event) => setAvailability(event.target.value as AvailabilityFilter)}
            value={availability}
          >
            <option value="all">Все состояния</option>
            <option value="available">Доступен</option>
            <option value="missing">Источник отсутствует</option>
            <option value="unreadable">Ошибка чтения</option>
          </select>
        </label>
        <button className="button button--secondary" disabled={!hasFilters} onClick={resetFilters} type="button">
          Сбросить
        </button>
      </div>

      {libraryStore.lastError || loadError ? (
        <p className="asset-manager__error" role="alert">{libraryStore.lastError ?? loadError}</p>
      ) : null}

      <div className="asset-manager__workspace">
        <div className="asset-manager__results">
          <div className="asset-manager__results-meta">
            <span>{isLoading ? 'Обновляем каталог…' : `Найдено: ${page.total}`}</span>
            {page.total > page.items.length ? (
              <small>Показаны первые {page.items.length}. Уточните фильтры для остальных файлов.</small>
            ) : (
              <small>Карточки виртуализированы — в DOM только видимая область.</small>
            )}
          </div>
          {libraryStore.snapshot.sources.length === 0 ? (
            <AssetManagerEmpty
              actionLabel="Подключить папку"
              description="Выберите папку с картами, токенами и handouts. Оригиналы копироваться не будут."
              onAction={() => void libraryStore.connectDirectory()}
              title="Источники ещё не подключены"
            />
          ) : page.items.length === 0 && !isLoading ? (
            <AssetManagerEmpty
              actionLabel={hasFilters ? 'Сбросить фильтры' : undefined}
              description={hasFilters ? 'Попробуйте изменить запрос или фильтры.' : 'Запустите сканирование подключённой папки.'}
              onAction={hasFilters ? resetFilters : undefined}
              title="Ассеты не найдены"
            />
          ) : (
            <VirtualizedAssetGrid
              items={page.items}
              onPreviewError={(assetId) =>
                setPreviewErrors((errors) => {
                  const nextErrors = new Set(errors)
                  nextErrors.add(assetId)
                  return nextErrors
                })
              }
              onSelect={selectAsset}
              previewErrors={previewErrors}
              resetKey={`${sourceId}:${format}:${sizeFilter}:${availability}:${debouncedSearch}`}
              selectedAssetId={selectedAssetId}
              sourcesById={sourcesById}
            />
          )}
        </div>

        <AssetDetails
          actionMessage={actionMessage}
          alwaysExport={alwaysExport}
          asset={selectedAsset}
          campaign={campaign}
          campaignAsset={campaignAsset}
          campaignKind={campaignKind}
          isCampaignBusy={isCampaignBusy}
          isPreviewBroken={selectedAsset ? previewErrors.has(selectedAsset.id) : false}
          isSavingTags={isSavingTags}
          onAlwaysExportChange={setAlwaysExport}
          onCampaignKindChange={setCampaignKind}
          onPreviewError={(assetId) =>
            setPreviewErrors((errors) => {
              const nextErrors = new Set(errors)
              nextErrors.add(assetId)
              return nextErrors
            })
          }
          onSaveTags={() => void saveTags()}
          onSelectForCampaign={() => void selectForCampaign()}
          onTagDraftChange={setTagDraft}
          sourceName={selectedAsset ? sourcesById.get(selectedAsset.sourceId)?.displayName : undefined}
          tagDraft={tagDraft}
        />
      </div>
    </section>
  )
}

interface VirtualizedAssetGridProps {
  items: AssetLibraryItem[]
  selectedAssetId: string | null
  previewErrors: ReadonlySet<string>
  resetKey: string
  sourcesById: ReadonlyMap<string, { displayName: string }>
  onPreviewError(assetId: string): void
  onSelect(asset: AssetLibraryItem): void
}

function VirtualizedAssetGrid({
  items,
  onPreviewError,
  onSelect,
  previewErrors,
  resetKey,
  selectedAssetId,
  sourcesById,
}: VirtualizedAssetGridProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const [viewportSize, setViewportSize] = useState({ width: 720, height: 600 })
  const [scrollTop, setScrollTop] = useState(0)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) {
      return
    }
    const updateSize = (): void => {
      setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight })
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    if (viewport) {
      viewport.scrollTop = 0
      setScrollTop(0)
    }
  }, [resetKey])

  const virtualWindow = calculateAssetGridWindow({
    itemCount: items.length,
    viewportWidth: viewportSize.width,
    viewportHeight: viewportSize.height,
    scrollTop,
  })
  const visibleItems = items.slice(virtualWindow.startIndex, virtualWindow.endIndex)

  return (
    <div
      aria-label="Сетка ассетов"
      className="asset-manager-grid"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      ref={viewportRef}
      role="grid"
    >
      <div className="asset-manager-grid__canvas" style={{ height: virtualWindow.totalHeight }}>
        {visibleItems.map((asset, visibleIndex) => {
          const index = virtualWindow.startIndex + visibleIndex
          const row = Math.floor(index / virtualWindow.columnCount)
          const column = index % virtualWindow.columnCount
          const style: CSSProperties = {
            width: virtualWindow.cardWidth,
            height: virtualWindow.rowHeight - virtualWindow.gap,
            transform: `translate3d(${column * (virtualWindow.cardWidth + virtualWindow.gap)}px, ${row * virtualWindow.rowHeight}px, 0)`,
          }
          return (
            <AssetCard
              asset={asset}
              isPreviewBroken={previewErrors.has(asset.id)}
              isSelected={selectedAssetId === asset.id}
              key={asset.id}
              onPreviewError={onPreviewError}
              onSelect={onSelect}
              sourceName={sourcesById.get(asset.sourceId)?.displayName}
              style={style}
            />
          )
        })}
      </div>
    </div>
  )
}

function AssetCard({
  asset,
  isPreviewBroken,
  isSelected,
  onPreviewError,
  onSelect,
  sourceName,
  style,
}: {
  asset: AssetLibraryItem
  isPreviewBroken: boolean
  isSelected: boolean
  onPreviewError(assetId: string): void
  onSelect(asset: AssetLibraryItem): void
  sourceName?: string
  style: CSSProperties
}) {
  return (
    <article
      className={isSelected ? 'asset-manager-card asset-manager-card--selected' : 'asset-manager-card'}
      role="gridcell"
      style={style}
    >
      <button aria-pressed={isSelected} className="asset-manager-card__select" onClick={() => onSelect(asset)} type="button">
        <AssetPreview
          asset={asset}
          isBroken={isPreviewBroken}
          onError={() => onPreviewError(asset.id)}
        />
        <div className="asset-manager-card__content">
          <div className="asset-manager-card__title">
            <strong title={asset.fileName}>{asset.fileName}</strong>
            <AvailabilityBadge availability={asset.availability} />
          </div>
          <span className="asset-manager-card__path" title={asset.relativePath}>{asset.relativePath}</span>
          <div className="asset-manager-card__meta">
            <span>{asset.format.toUpperCase()}</span>
            <span>{asset.width}×{asset.height}</span>
            <span>{formatFileSize(asset.byteSize)}</span>
          </div>
          <div className="asset-manager-card__tags">
            {asset.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
            {asset.tags.length > 2 ? <span>+{asset.tags.length - 2}</span> : null}
            {asset.tags.length === 0 ? <span className="asset-manager-card__tag-empty">без тегов</span> : null}
          </div>
          <small>{sourceName ?? 'Источник'}</small>
        </div>
      </button>
    </article>
  )
}

interface AssetDetailsProps {
  actionMessage: string
  alwaysExport: boolean
  asset: AssetLibraryItem | null
  campaign: Campaign | null
  campaignAsset: Asset | null
  campaignKind: ImageAssetKind
  isCampaignBusy: boolean
  isPreviewBroken: boolean
  isSavingTags: boolean
  sourceName?: string
  tagDraft: string
  onAlwaysExportChange(value: boolean): void
  onCampaignKindChange(value: ImageAssetKind): void
  onPreviewError(assetId: string): void
  onSaveTags(): void
  onSelectForCampaign(): void
  onTagDraftChange(value: string): void
}

function AssetDetails({
  actionMessage,
  alwaysExport,
  asset,
  campaign,
  campaignAsset,
  campaignKind,
  isCampaignBusy,
  isPreviewBroken,
  isSavingTags,
  onAlwaysExportChange,
  onCampaignKindChange,
  onPreviewError,
  onSaveTags,
  onSelectForCampaign,
  onTagDraftChange,
  sourceName,
  tagDraft,
}: AssetDetailsProps) {
  if (!asset) {
    return (
      <aside className="asset-manager-details asset-manager-details--empty">
        <span aria-hidden="true">◇</span>
        <h3>Детали ассета</h3>
        <p>Выберите карточку в сетке. Здесь появятся метаданные, теги и настройки кампании.</p>
      </aside>
    )
  }

  const canSelectForCampaign = campaign !== null && Boolean(asset.sha256)

  return (
    <aside className="asset-manager-details" aria-label={`Детали ${asset.fileName}`}>
      <div className="asset-manager-details__preview">
        <AssetPreview asset={asset} isBroken={isPreviewBroken} onError={() => onPreviewError(asset.id)} />
      </div>
      <div className="asset-manager-details__title">
        <div>
          <p className="eyebrow">Выбранный файл</p>
          <h3>{asset.fileName}</h3>
        </div>
        <AvailabilityBadge availability={asset.availability} />
      </div>
      <p className="asset-manager-details__path" title={asset.relativePath}>{asset.relativePath}</p>
      <dl className="asset-manager-details__metadata">
        <div><dt>Источник</dt><dd>{sourceName ?? '—'}</dd></div>
        <div><dt>Размер</dt><dd>{formatFileSize(asset.byteSize)}</dd></div>
        <div><dt>Формат</dt><dd>{asset.format.toUpperCase()} · {asset.mimeType}</dd></div>
        <div><dt>Габариты</dt><dd>{asset.width} × {asset.height}</dd></div>
        <div><dt>SHA-256</dt><dd title={asset.sha256}>{asset.sha256?.slice(0, 12) ?? 'не вычислен'}…</dd></div>
      </dl>

      <form
        className="asset-manager-details__form"
        onSubmit={(event) => {
          event.preventDefault()
          onSaveTags()
        }}
      >
        <label>
          <span>Пользовательские теги</span>
          <input
            disabled={isSavingTags}
            onChange={(event) => onTagDraftChange(event.target.value)}
            placeholder="подземелье, босс, ночь"
            value={tagDraft}
          />
        </label>
        <button className="button button--secondary" disabled={isSavingTags} type="submit">
          {isSavingTags ? 'Сохраняем…' : 'Сохранить теги'}
        </button>
      </form>

      <div className="asset-manager-details__campaign">
        <div>
          <p className="eyebrow">Кампания</p>
          <strong>{campaign?.name ?? 'Кампания не открыта'}</strong>
          {campaignAsset ? <span className="status-badge">Уже выбран</span> : null}
        </div>
        <label>
          <span>Тип в кампании</span>
          <select
            disabled={!canSelectForCampaign || isCampaignBusy}
            onChange={(event) => onCampaignKindChange(event.target.value as ImageAssetKind)}
            value={campaignKind}
          >
            <option value="map">Карта</option>
            <option value="token">Токен</option>
            <option value="portrait">Портрет</option>
            <option value="handout">Handout</option>
            <option value="other">Другое изображение</option>
          </select>
        </label>
        <label className="asset-manager-details__checkbox">
          <input
            checked={alwaysExport}
            disabled={!canSelectForCampaign || isCampaignBusy}
            onChange={(event) => onAlwaysExportChange(event.target.checked)}
            type="checkbox"
          />
          <span>Всегда добавлять в экспорт кампании</span>
        </label>
        <button
          className="button"
          disabled={!canSelectForCampaign || isCampaignBusy}
          onClick={onSelectForCampaign}
          type="button"
        >
          {campaignAsset ? 'Обновить выбор' : 'Добавить в кампанию'}
        </button>
        {!canSelectForCampaign ? (
          <small>
            {!campaign
              ? 'Откройте кампанию, чтобы выбрать ассет.'
              : 'Добавление недоступно, пока для файла не вычислен SHA-256.'}
          </small>
        ) : null}
      </div>
      <p className="asset-manager-details__status" aria-live="polite">{actionMessage}</p>
    </aside>
  )
}

function AssetPreview({
  asset,
  isBroken,
  onError,
}: {
  asset: AssetLibraryItem
  isBroken: boolean
  onError(): void
}) {
  if (asset.availability === 'missing') {
    return <div className="asset-manager-preview-state"><span>!</span><small>Источник отсутствует</small></div>
  }
  if (asset.availability === 'unreadable') {
    return <div className="asset-manager-preview-state"><span>×</span><small>Ошибка чтения</small></div>
  }
  if (!asset.previewUrl || isBroken) {
    return <div className="asset-manager-preview-state"><span>◇</span><small>Превью недоступно</small></div>
  }
  return <img alt={asset.fileName} loading="lazy" onError={onError} src={asset.previewUrl} />
}

function AvailabilityBadge({ availability }: { availability: IndexedAssetAvailability }) {
  const labels: Record<IndexedAssetAvailability, string> = {
    available: 'Доступен',
    missing: 'Нет файла',
    unreadable: 'Ошибка',
  }
  return <span className={`asset-manager-availability asset-manager-availability--${availability}`}>{labels[availability]}</span>
}

function AssetManagerEmpty({
  actionLabel,
  description,
  onAction,
  title,
}: {
  actionLabel?: string
  description: string
  onAction?: () => void
  title: string
}) {
  return (
    <div className="asset-manager-empty">
      <span aria-hidden="true">◇</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && onAction ? <button className="button" onClick={onAction} type="button">{actionLabel}</button> : null}
    </div>
  )
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [delayMs, value])
  return debouncedValue
}

function getSizeQuery(filter: AssetSizeFilter): Pick<AssetLibraryQuery, 'maxByteSize' | 'minByteSize'> {
  switch (filter) {
    case 'small':
      return { maxByteSize: 1024 * 1024 - 1 }
    case 'medium':
      return { minByteSize: 1024 * 1024, maxByteSize: 10 * 1024 * 1024 }
    case 'large':
      return { minByteSize: 10 * 1024 * 1024 + 1 }
    case 'all':
      return {}
  }
}

function findCampaignAsset(campaign: Campaign | null, indexedAssetId: string): Asset | null {
  return campaign?.assets.find(
    (asset) => asset.storageRef?.kind !== 'embedded-data' && asset.storageRef?.indexedAssetId === indexedAssetId,
  ) ?? null
}

function inferAssetKind(asset: AssetLibraryItem): ImageAssetKind {
  const searchText = `${asset.fileName} ${asset.relativePath} ${asset.tags.join(' ')}`.toLocaleLowerCase('ru')
  if (/token|токен/.test(searchText)) return 'token'
  if (/portrait|портрет/.test(searchText)) return 'portrait'
  if (/handout|раздат|письмо/.test(searchText)) return 'handout'
  if (/map|карта|battlemap/.test(searchText)) return 'map'
  return 'other'
}

function isImageAssetKind(kind: Asset['kind']): kind is ImageAssetKind {
  return kind !== 'audio'
}

function formatFileSize(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize} Б`
  if (byteSize < 1024 * 1024) return `${(byteSize / 1024).toFixed(1)} КБ`
  return `${(byteSize / (1024 * 1024)).toFixed(1)} МБ`
}

function getIndexingStatus(status: string): string {
  return status === 'cancelling' ? 'Останавливаем' : 'Индексация'
}

function getProgressWidth(progress: { discoveredCount: number; processedCount: number; phase: string }): string {
  if (progress.phase === 'discovering') {
    return progress.discoveredCount > 0 ? '12%' : '4%'
  }
  if (progress.discoveredCount === 0) {
    return '4%'
  }
  return `${Math.max(4, Math.min(100, (progress.processedCount / progress.discoveredCount) * 100))}%`
}
