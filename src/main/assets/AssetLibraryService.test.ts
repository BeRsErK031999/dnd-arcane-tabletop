import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { AssetLibrarySource, IndexedAsset } from '../../shared/types/index.js'
import { SqlJsAssetCatalog } from './catalog/SqlJsAssetCatalog.js'
import { AssetLibraryIndexer } from './indexing/AssetLibraryIndexer.js'
import type { ImageProcessor } from './indexing/ImageProcessor.js'
import { AssetLibraryService } from './AssetLibraryService.js'
import { FileSystemManagedAssetStore } from './FileSystemManagedAssetStore.js'

const tempDirectories: string[] = []
const openCatalogs: SqlJsAssetCatalog[] = []

afterEach(async () => {
  await Promise.all(openCatalogs.splice(0).map((catalog) => catalog.close()))
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('AssetLibraryService catalog operations', () => {
  it('returns renderer-safe file URLs and updates user tags', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'arcane-library-service-'))
    tempDirectories.push(directory)
    const catalog = new SqlJsAssetCatalog(path.join(directory, 'catalog.sqlite'))
    openCatalogs.push(catalog)
    const indexer = new AssetLibraryIndexer(catalog, path.join(directory, 'previews'), unusedImageProcessor)
    const service = new AssetLibraryService(catalog, indexer)
    const source = createSource(path.join(directory, 'source'))
    const asset = createAsset(source, directory)
    await service.initialize()
    await catalog.saveSource(source)
    await catalog.saveAsset(asset)

    await expect(service.queryAssets({ search: 'ritual', offset: 0, limit: 50 })).resolves.toMatchObject({
      total: 1,
      items: [
        {
          id: asset.id,
          fileUrl: pathToFileURL(asset.canonicalPath).toString(),
          previewUrl: pathToFileURL(asset.previewPath!).toString(),
        },
      ],
    })
    await expect(service.updateTags(asset.id, [' ночь ', 'boss', 'ночь'])).resolves.toMatchObject({
      ok: true,
      asset: { tags: ['boss', 'ночь'] },
    })
  })

  it('does not expose an original file URL for missing assets', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'arcane-library-service-'))
    tempDirectories.push(directory)
    const catalog = new SqlJsAssetCatalog(path.join(directory, 'catalog.sqlite'))
    openCatalogs.push(catalog)
    const service = new AssetLibraryService(
      catalog,
      new AssetLibraryIndexer(catalog, path.join(directory, 'previews'), unusedImageProcessor),
    )
    const source = createSource(path.join(directory, 'source'))
    const asset = { ...createAsset(source, directory), availability: 'missing' as const }
    await service.initialize()
    await catalog.saveSource(source)
    await catalog.saveAsset(asset)

    const page = await service.queryAssets({ availability: ['missing'], offset: 0, limit: 20 })
    expect(page.items[0]).not.toHaveProperty('fileUrl')
  })

  it('copies indexed assets once, binds campaigns and garbage-collects only after references are removed', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'arcane-library-service-'))
    tempDirectories.push(directory)
    const catalog = new SqlJsAssetCatalog(path.join(directory, 'catalog.sqlite'))
    openCatalogs.push(catalog)
    const managedStore = new FileSystemManagedAssetStore(path.join(directory, 'managed-store'), catalog)
    const service = new AssetLibraryService(
      catalog,
      new AssetLibraryIndexer(catalog, path.join(directory, 'previews'), unusedImageProcessor),
      managedStore,
    )
    const source = createSource(path.join(directory, 'source'))
    const sourceFilePath = path.join(source.rootPath, 'maps', 'ritual.png')
    const contents = Buffer.from('ritual-map-content')
    const asset = {
      ...createAsset(source, directory),
      canonicalPath: sourceFilePath,
      byteSize: contents.length,
      sha256: createHash('sha256').update(contents).digest('hex'),
    }
    await mkdir(path.dirname(sourceFilePath), { recursive: true })
    await writeFile(sourceFilePath, contents)
    await service.initialize()
    await catalog.saveSource(source)
    await catalog.saveAsset(asset)

    const first = await service.manageIndexedAssetForCampaign({
      campaignId: 'campaign-a',
      indexedAssetId: asset.id,
      exportPolicy: 'when-used',
    })
    expect(first).toMatchObject({ ok: true, deduplicated: false })
    await rm(sourceFilePath)
    await catalog.saveAsset({ ...asset, availability: 'missing' })
    const second = await service.manageIndexedAssetForCampaign({
      campaignId: 'campaign-b',
      indexedAssetId: asset.id,
      exportPolicy: 'always',
    })
    expect(second).toMatchObject({ ok: true, deduplicated: true })
    if (!first.ok || !second.ok) {
      return
    }
    expect(second.storageRef.sha256).toBe(first.storageRef.sha256)
    expect(second.fileUrl).toBe(first.fileUrl)
    await expect(service.previewManagedGarbageCollection()).resolves.toMatchObject({
      ok: true,
      plan: { candidates: [] },
    })

    await service.removeCampaignBindings('campaign-a')
    await service.removeCampaignBindings('campaign-b')
    const preview = await service.previewManagedGarbageCollection()
    expect(preview).toMatchObject({ ok: true, plan: { candidates: [{ sha256: asset.sha256 }] } })
    if (!preview.ok) {
      return
    }
    await expect(service.collectManagedGarbage('stale-plan')).resolves.toEqual({
      ok: false,
      reason: 'invalid-plan',
    })
    const protectedPreview = await service.previewManagedGarbageCollection()
    if (!protectedPreview.ok) {
      return
    }
    await catalog.saveCampaignAssetBinding({
      campaignId: 'campaign-c',
      assetId: 'asset-late-reference',
      storage: first.storageRef,
      exportPolicy: 'when-used',
      createdAt: '2026-07-15T12:00:00.000Z',
      updatedAt: '2026-07-15T12:00:00.000Z',
    })
    await expect(service.collectManagedGarbage(protectedPreview.plan.token)).resolves.toMatchObject({
      ok: true,
      deletedSha256: [],
      skippedSha256: [asset.sha256],
      reclaimedByteSize: 0,
    })

    await service.removeCampaignBindings('campaign-c')
    const finalPreview = await service.previewManagedGarbageCollection()
    if (!finalPreview.ok) {
      return
    }
    await expect(service.collectManagedGarbage(finalPreview.plan.token)).resolves.toMatchObject({
      ok: true,
      deletedSha256: [asset.sha256],
      skippedSha256: [],
      reclaimedByteSize: contents.length,
    })
    await expect(managedStore.resolveFileUrl(asset.sha256)).resolves.toBeNull()
    await expect(
      service.manageIndexedAssetForCampaign({
        campaignId: 'campaign-d',
        indexedAssetId: asset.id,
        exportPolicy: 'when-used',
      }),
    ).resolves.toEqual({ ok: false, reason: 'asset-unavailable' })
  })
})

const unusedImageProcessor: ImageProcessor = {
  process: async () => {
    throw new Error('Image processor must not run in catalog operation tests')
  },
}

function createSource(rootPath: string): AssetLibrarySource {
  return {
    id: 'asset-source-service-test',
    rootPath,
    displayName: 'Source',
    status: 'ready',
    createdAt: '2026-07-15T08:00:00.000Z',
    updatedAt: '2026-07-15T08:00:00.000Z',
  }
}

function createAsset(source: AssetLibrarySource, directory: string): IndexedAsset {
  return {
    id: 'indexed-ritual-map',
    sourceId: source.id,
    canonicalPath: path.join(source.rootPath, 'maps', 'ritual.png'),
    relativePath: 'maps/ritual.png',
    fileName: 'ritual.png',
    byteSize: 4096,
    modifiedAt: '2026-07-15T08:00:00.000Z',
    kind: 'other',
    mimeType: 'image/png',
    format: 'png',
    width: 1600,
    height: 900,
    sha256: 'b'.repeat(64),
    previewPath: path.join(directory, 'previews', 'ritual.webp'),
    tags: ['ritual'],
    availability: 'available',
    indexedAt: '2026-07-15T08:00:00.000Z',
  }
}
