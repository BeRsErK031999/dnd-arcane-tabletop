import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AssetLibraryService } from '../AssetLibraryService.js'
import { SqlJsAssetCatalog } from '../catalog/SqlJsAssetCatalog.js'
import { AssetLibraryIndexer } from './AssetLibraryIndexer.js'
import type { ImageProcessingResult, ImageProcessor } from './ImageProcessor.js'

const tempDirectories: string[] = []
const openCatalogs: SqlJsAssetCatalog[] = []

afterEach(async () => {
  await Promise.all(openCatalogs.splice(0).map((catalog) => catalog.close()))
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('AssetLibraryIndexer', () => {
  it('indexes a large recursive library and incrementally marks deleted files missing', async () => {
    const directory = await createTempDirectory()
    const sourceDirectory = path.join(directory, 'source')
    const nestedDirectory = path.join(sourceDirectory, 'nested')
    await mkdir(nestedDirectory, { recursive: true })
    const imagePaths = Array.from({ length: 220 }, (_, index) =>
      path.join(index % 2 === 0 ? sourceDirectory : nestedDirectory, `image-${index}.png`),
    )
    await Promise.all(imagePaths.map((filePath, index) => writeFile(filePath, `image-content-${index}`)))
    await writeFile(path.join(sourceDirectory, 'ignore.txt'), 'not an image')

    const { catalog, indexer, service, processor } = await createServices(directory)
    const connection = await service.connectDirectory(sourceDirectory)
    expect(connection.ok).toBe(true)
    await indexer.waitForCurrentJob()

    const firstPage = await catalog.queryAssets({ offset: 0, limit: 500 })
    expect(firstPage.total).toBe(220)
    expect(firstPage.items.every((asset) => asset.availability === 'available')).toBe(true)
    expect(firstPage.items.every((asset) => asset.sha256?.length === 64)).toBe(true)
    expect(processor.processedCount).toBe(220)

    if (!connection.ok) {
      return
    }
    const rescan = await service.startIndexing(connection.source.id)
    expect(rescan.ok).toBe(true)
    await indexer.waitForCurrentJob()
    expect(indexer.getProgress()).toMatchObject({ status: 'completed', skippedCount: 220, errorCount: 0 })
    expect(processor.processedCount).toBe(220)

    await unlink(imagePaths[0]!)
    await service.startIndexing(connection.source.id)
    await indexer.waitForCurrentJob()
    const missingPage = await catalog.queryAssets({ availability: ['missing'], offset: 0, limit: 20 })
    expect(missingPage.total).toBe(1)
    expect(missingPage.items[0]?.canonicalPath).toBe(path.resolve(imagePaths[0]!))
  })

  it('cancels without marking unseen records missing and can resume', async () => {
    const directory = await createTempDirectory()
    const sourceDirectory = path.join(directory, 'source')
    await mkdir(sourceDirectory)
    await Promise.all(
      Array.from({ length: 8 }, (_, index) => writeFile(path.join(sourceDirectory, `image-${index}.png`), `v1-${index}`)),
    )
    const { catalog, indexer, service, processor } = await createServices(directory)
    const connection = await service.connectDirectory(sourceDirectory)
    expect(connection.ok).toBe(true)
    await indexer.waitForCurrentJob()

    if (!connection.ok) {
      return
    }
    await Promise.all(
      Array.from({ length: 8 }, (_, index) => writeFile(path.join(sourceDirectory, `image-${index}.png`), `v2-${index}`)),
    )
    processor.pause()
    await service.startIndexing(connection.source.id)
    await processor.waitUntilPaused()
    await service.cancelIndexing()
    processor.resume()
    await indexer.waitForCurrentJob()
    expect(indexer.getProgress().status).toBe('cancelled')
    await expect(catalog.queryAssets({ availability: ['missing'], offset: 0, limit: 20 })).resolves.toMatchObject({
      total: 0,
    })

    await service.startIndexing(connection.source.id)
    await indexer.waitForCurrentJob()
    expect(indexer.getProgress()).toMatchObject({ status: 'completed', processedCount: 8 })
  })
})

async function createServices(directory: string): Promise<{
  catalog: SqlJsAssetCatalog
  indexer: AssetLibraryIndexer
  service: AssetLibraryService
  processor: FakeImageProcessor
}> {
  const catalog = new SqlJsAssetCatalog(path.join(directory, 'catalog', 'assets.sqlite'))
  openCatalogs.push(catalog)
  const processor = new FakeImageProcessor()
  const indexer = new AssetLibraryIndexer(catalog, path.join(directory, 'previews'), processor)
  const service = new AssetLibraryService(catalog, indexer)
  await service.initialize()
  return { catalog, indexer, service, processor }
}

class FakeImageProcessor implements ImageProcessor {
  processedCount = 0
  private pausePromise: Promise<void> | null = null
  private releasePause: (() => void) | null = null
  private pausedPromise: Promise<void> | null = null
  private reportPaused: (() => void) | null = null

  pause(): void {
    this.pausePromise = new Promise((resolve) => {
      this.releasePause = resolve
    })
    this.pausedPromise = new Promise((resolve) => {
      this.reportPaused = resolve
    })
  }

  waitUntilPaused(): Promise<void> {
    return this.pausedPromise ?? Promise.resolve()
  }

  resume(): void {
    this.releasePause?.()
    this.pausePromise = null
    this.releasePause = null
  }

  async process(_sourceFilePath: string, previewFilePath: string): Promise<ImageProcessingResult> {
    this.reportPaused?.()
    this.reportPaused = null
    await this.pausePromise
    await mkdir(path.dirname(previewFilePath), { recursive: true })
    await writeFile(previewFilePath, 'preview')
    this.processedCount += 1
    return {
      width: 1280,
      height: 720,
      format: 'png',
      mimeType: 'image/png',
      previewPath: previewFilePath,
    }
  }
}

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'arcane-indexer-'))
  tempDirectories.push(directory)
  return directory
}
