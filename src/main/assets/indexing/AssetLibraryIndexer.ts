import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, type Dirent, type Stats } from 'node:fs'
import { access, opendir, stat } from 'node:fs/promises'
import path from 'node:path'
import type {
  AssetIndexProgress,
  AssetLibrarySource,
  IndexedAsset,
  IsoDateString,
} from '../../../shared/types/index.js'
import type { AssetIndexService } from '../hybridStorageContracts.js'
import type { ImageProcessor } from './ImageProcessor.js'

const supportedImageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jfif', '.jpg', '.png', '.webp'])
const indexedAssetBatchSize = 50
const progressEmitIntervalMs = 80

export type AssetIndexProgressListener = (progress: AssetIndexProgress) => void

export class AssetLibraryIndexer {
  private progress: AssetIndexProgress = createIdleProgress()
  private readonly listeners = new Set<AssetIndexProgressListener>()
  private activeController: AbortController | null = null
  private activeJob: Promise<void> | null = null
  private lastProgressEmitAt = 0

  constructor(
    private readonly catalog: AssetIndexService,
    private readonly previewsDirectory: string,
    private readonly imageProcessor: ImageProcessor,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getProgress(): AssetIndexProgress {
    return { ...this.progress }
  }

  isRunning(): boolean {
    return this.activeController !== null
  }

  subscribe(listener: AssetIndexProgressListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(source: AssetLibrarySource): Promise<boolean> {
    if (this.activeController) {
      return false
    }

    const controller = new AbortController()
    this.activeController = controller
    const startedAt = this.toIsoDate()
    this.setProgress(
      {
        status: 'running',
        phase: 'discovering',
        sourceId: source.id,
        sourceName: source.displayName,
        discoveredCount: 0,
        processedCount: 0,
        indexedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        startedAt,
        message: 'Поиск изображений…',
      },
      true,
    )

    try {
      await this.catalog.saveSource({
        ...source,
        status: 'indexing',
        updatedAt: startedAt,
        lastScanStartedAt: startedAt,
        lastError: undefined,
      })
    } catch (error) {
      this.activeController = null
      await this.finishFailed(source, error)
      throw error
    }

    this.activeJob = this.run(source, controller.signal).finally(() => {
      if (this.activeController === controller) {
        this.activeController = null
        this.activeJob = null
      }
    })
    return true
  }

  cancel(): boolean {
    if (!this.activeController) {
      return false
    }
    this.activeController.abort()
    this.setProgress(
      {
        ...this.progress,
        status: 'cancelling',
        message: 'Останавливаем после текущего файла…',
      },
      true,
    )
    return true
  }

  async waitForCurrentJob(): Promise<void> {
    await this.activeJob
  }

  private async run(source: AssetLibrarySource, signal: AbortSignal): Promise<void> {
    const scanId = randomUUID()
    const batch: IndexedAsset[] = []
    const discoveredFiles: string[] = []

    try {
      for await (const filePath of walkSupportedImages(source.rootPath, signal)) {
        if (signal.aborted) {
          break
        }
        discoveredFiles.push(filePath)
        this.progress.discoveredCount += 1
        this.progress.currentFileName = path.basename(filePath)
        this.progress.message = 'Поиск изображений…'
        this.emitProgress()
      }

      if (signal.aborted) {
        await this.finishCancelled(source)
        return
      }

      this.setProgress(
        {
          ...this.progress,
          phase: 'processing',
          currentFileName: undefined,
          message: 'Индексация изображений…',
        },
        true,
      )

      for (const filePath of discoveredFiles) {
        if (signal.aborted) {
          break
        }
        this.progress.currentFileName = path.basename(filePath)
        this.emitProgress()

        const asset = await this.indexFile(source, filePath)
        batch.push(asset.record)
        this.progress.processedCount += 1
        if (asset.skipped) {
          this.progress.skippedCount += 1
        } else if (asset.record.availability === 'available') {
          this.progress.indexedCount += 1
        } else {
          this.progress.errorCount += 1
        }

        if (batch.length >= indexedAssetBatchSize) {
          await this.catalog.saveAssets(batch.splice(0), scanId)
        }
        this.emitProgress()
      }

      if (batch.length > 0) {
        await this.catalog.saveAssets(batch, scanId)
      }

      if (signal.aborted) {
        await this.finishCancelled(source)
        return
      }

      this.setProgress(
        {
          ...this.progress,
          phase: 'finalizing',
          currentFileName: undefined,
          message: 'Проверка удалённых файлов…',
        },
        true,
      )
      await this.catalog.markSourceAssetsMissing(source.id, scanId)
      const finishedAt = this.toIsoDate()
      await this.catalog.saveSource({
        ...source,
        status: 'ready',
        updatedAt: finishedAt,
        lastScanStartedAt: this.progress.startedAt,
        lastScanCompletedAt: finishedAt,
        lastError: undefined,
      })
      this.setProgress(
        {
          ...this.progress,
          status: 'completed',
          phase: 'idle',
          currentFileName: undefined,
          finishedAt,
          message: createCompletedMessage(this.progress),
        },
        true,
      )
    } catch (error) {
      if (signal.aborted) {
        await this.finishCancelled(source)
        return
      }
      await this.finishFailed(source, error)
    }
  }

  private async indexFile(
    source: AssetLibrarySource,
    filePath: string,
  ): Promise<{ record: IndexedAsset; skipped: boolean }> {
    const canonicalPath = path.resolve(filePath)
    const relativePath = path.relative(source.rootPath, canonicalPath).split(path.sep).join('/')
    const fileName = path.basename(canonicalPath)
    const indexedAt = this.toIsoDate()
    let fileStats: Stats | undefined
    let existing: IndexedAsset | null = null
    let sha256: string | undefined

    try {
      fileStats = await stat(canonicalPath)
      existing = await this.catalog.getAssetByCanonicalPath(source.id, canonicalPath)
      if (
        existing &&
        existing.byteSize === fileStats.size &&
        existing.modifiedAt === fileStats.mtime.toISOString() &&
        existing.availability === 'available' &&
        existing.previewPath &&
        (await fileExists(existing.previewPath))
      ) {
        return {
          record: {
            ...existing,
            indexedAt,
          },
          skipped: true,
        }
      }

      sha256 = await hashFile(canonicalPath)
      const previewPath = path.join(this.previewsDirectory, sha256.slice(0, 2), `${sha256}.webp`)
      const processed = await this.imageProcessor.process(canonicalPath, previewPath)
      return {
        record: {
          id: existing?.id ?? createIndexedAssetId(source.id, canonicalPath),
          sourceId: source.id,
          canonicalPath,
          relativePath,
          fileName,
          byteSize: fileStats.size,
          modifiedAt: fileStats.mtime.toISOString(),
          kind: existing?.kind ?? 'other',
          mimeType: processed.mimeType,
          format: processed.format,
          width: processed.width,
          height: processed.height,
          sha256,
          previewPath: processed.previewPath,
          tags: existing?.tags ?? [],
          availability: 'available',
          indexedAt,
        },
        skipped: false,
      }
    } catch {
      const extension = path.extname(canonicalPath).slice(1).toLowerCase() || 'unknown'
      return {
        record: {
          id: existing?.id ?? createIndexedAssetId(source.id, canonicalPath),
          sourceId: source.id,
          canonicalPath,
          relativePath,
          fileName,
          byteSize: fileStats?.size ?? 0,
          modifiedAt: fileStats?.mtime.toISOString() ?? indexedAt,
          kind: existing?.kind ?? 'other',
          mimeType: mimeTypeForExtension(extension),
          format: extension,
          width: existing?.width ?? 0,
          height: existing?.height ?? 0,
          sha256,
          previewPath: existing?.previewPath,
          tags: existing?.tags ?? [],
          availability: 'unreadable',
          indexedAt,
        },
        skipped: false,
      }
    }
  }

  private async finishCancelled(source: AssetLibrarySource): Promise<void> {
    const finishedAt = this.toIsoDate()
    await this.catalog.saveSource({
      ...source,
      status: 'idle',
      updatedAt: finishedAt,
      lastScanStartedAt: this.progress.startedAt,
      lastScanCompletedAt: source.lastScanCompletedAt,
      lastError: undefined,
    })
    this.setProgress(
      {
        ...this.progress,
        status: 'cancelled',
        phase: 'idle',
        currentFileName: undefined,
        finishedAt,
        message: 'Индексация остановлена. Её можно продолжить повторным сканированием.',
      },
      true,
    )
  }

  private async finishFailed(source: AssetLibrarySource, error: unknown): Promise<void> {
    const finishedAt = this.toIsoDate()
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка индексации'
    await this.catalog
      .saveSource({
        ...source,
        status: 'error',
        updatedAt: finishedAt,
        lastScanStartedAt: this.progress.startedAt,
        lastScanCompletedAt: source.lastScanCompletedAt,
        lastError: message,
      })
      .catch(() => undefined)
    this.setProgress(
      {
        ...this.progress,
        status: 'failed',
        phase: 'idle',
        currentFileName: undefined,
        finishedAt,
        message,
      },
      true,
    )
  }

  private setProgress(progress: AssetIndexProgress, force: boolean): void {
    this.progress = progress
    this.emitProgress(force)
  }

  private emitProgress(force = false): void {
    const now = Date.now()
    if (!force && now - this.lastProgressEmitAt < progressEmitIntervalMs) {
      return
    }
    this.lastProgressEmitAt = now
    const snapshot = this.getProgress()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }

  private toIsoDate(): IsoDateString {
    return this.now().toISOString()
  }
}

async function* walkSupportedImages(rootPath: string, signal: AbortSignal): AsyncGenerator<string> {
  const directory = await opendir(rootPath)
  for await (const entry of directory) {
    if (signal.aborted) {
      return
    }
    const entryPath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) {
      yield* walkSupportedImages(entryPath, signal)
    } else if (isSupportedImage(entry)) {
      yield entryPath
    }
  }
}

function isSupportedImage(entry: Dirent): boolean {
  return entry.isFile() && supportedImageExtensions.has(path.extname(entry.name).toLowerCase())
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk as Buffer)
  }
  return hash.digest('hex')
}

function createIndexedAssetId(sourceId: string, canonicalPath: string): string {
  const identity = `${sourceId}\0${canonicalPath.toLocaleLowerCase('en-US')}`
  return `indexed-asset-${createHash('sha256').update(identity).digest('hex').slice(0, 32)}`
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function mimeTypeForExtension(extension: string): string {
  if (extension === 'jpg' || extension === 'jpeg' || extension === 'jfif') {
    return 'image/jpeg'
  }
  return `image/${extension}`
}

function createIdleProgress(): AssetIndexProgress {
  return {
    status: 'idle',
    phase: 'idle',
    discoveredCount: 0,
    processedCount: 0,
    indexedCount: 0,
    skippedCount: 0,
    errorCount: 0,
  }
}

function createCompletedMessage(progress: AssetIndexProgress): string {
  if (progress.discoveredCount === 0) {
    return 'Поддерживаемые изображения не найдены.'
  }
  return `Готово: ${progress.processedCount} файлов, ${progress.errorCount} с ошибками.`
}
