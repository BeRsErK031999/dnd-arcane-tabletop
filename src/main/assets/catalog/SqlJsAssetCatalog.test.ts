import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AssetLibrarySource, IndexedAsset } from '../../../shared/types/index.js'
import { ASSET_CATALOG_SCHEMA_VERSION } from './assetCatalogMigrations.js'
import { SqlJsAssetCatalog } from './SqlJsAssetCatalog.js'

const tempDirectories: string[] = []
const openCatalogs: SqlJsAssetCatalog[] = []

afterEach(async () => {
  await Promise.all(openCatalogs.splice(0).map((catalog) => catalog.close()))
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('SqlJsAssetCatalog', () => {
  it('creates, migrates and reopens a persistent SQLite catalog', async () => {
    const databaseFilePath = await createDatabaseFilePath()
    const source = createSource()
    const asset = createAsset(source.id, 'maps/ritual.png', ['карта', 'ночь'])
    const catalog = trackCatalog(new SqlJsAssetCatalog(databaseFilePath))

    await catalog.initialize()
    await catalog.saveSource(source)
    await catalog.saveAsset(asset)
    await catalog.close()
    openCatalogs.splice(openCatalogs.indexOf(catalog), 1)

    const reopenedCatalog = trackCatalog(new SqlJsAssetCatalog(databaseFilePath))
    await reopenedCatalog.initialize()

    await expect(reopenedCatalog.getUserVersion()).resolves.toBe(ASSET_CATALOG_SCHEMA_VERSION)
    await expect(reopenedCatalog.listSources()).resolves.toEqual([source])
    await expect(reopenedCatalog.getAsset(asset.id)).resolves.toEqual(asset)
  })

  it('filters by name and tags and marks records missing after an incremental scan', async () => {
    const catalog = trackCatalog(new SqlJsAssetCatalog(await createDatabaseFilePath()))
    const source = createSource()
    const mapAsset = createAsset(source.id, 'maps/ritual.png', ['карта', 'ночь'])
    const portraitAsset = createAsset(source.id, 'portraits/mage.webp', ['портрет'])
    await catalog.initialize()
    await catalog.saveSource(source)
    await catalog.saveAssets([mapAsset, portraitAsset], 'scan-1')
    await catalog.updateTags(mapAsset.id, ['ночь', 'избранное', 'ночь'])

    await expect(
      catalog.queryAssets({ search: 'ritual', tags: ['избранное'], offset: 0, limit: 20 }),
    ).resolves.toMatchObject({
      total: 1,
      items: [{ id: mapAsset.id, tags: ['избранное', 'ночь'] }],
    })

    await catalog.saveAssets([{ ...mapAsset, tags: ['избранное', 'ночь'] }], 'scan-2')
    await catalog.markSourceAssetsMissing(source.id, 'scan-2')

    await expect(catalog.getAsset(mapAsset.id)).resolves.toMatchObject({ availability: 'available' })
    await expect(catalog.getAsset(portraitAsset.id)).resolves.toMatchObject({ availability: 'missing' })
  })

  it('searches unicode tags and applies byte-size boundaries', async () => {
    const catalog = trackCatalog(new SqlJsAssetCatalog(await createDatabaseFilePath()))
    const source = createSource()
    const smallAsset = {
      ...createAsset(source.id, 'maps/moon.png', ['Ночной Зал']),
      byteSize: 800_000,
    }
    const largeAsset = {
      ...createAsset(source.id, 'maps/castle.webp', ['крепость']),
      byteSize: 12_000_000,
    }
    await catalog.initialize()
    await catalog.saveSource(source)
    await catalog.saveAssets([smallAsset, largeAsset], 'scan-1')

    await expect(catalog.queryAssets({ search: 'НОЧНОЙ', offset: 0, limit: 20 })).resolves.toMatchObject({
      total: 1,
      items: [{ id: smallAsset.id }],
    })
    await expect(
      catalog.queryAssets({ minByteSize: 10_000_000, availability: ['available'], offset: 0, limit: 20 }),
    ).resolves.toMatchObject({
      total: 1,
      items: [{ id: largeAsset.id }],
    })
    await expect(catalog.queryAssets({ maxByteSize: 1_000_000, offset: 0, limit: 20 })).resolves.toMatchObject({
      total: 1,
      items: [{ id: smallAsset.id }],
    })
  })

  it('tracks a legacy checksum without requiring a managed blob row', async () => {
    const catalog = trackCatalog(new SqlJsAssetCatalog(await createDatabaseFilePath()))
    await catalog.initialize()

    await expect(
      catalog.saveCampaignAssetBinding({
        campaignId: 'campaign-legacy',
        assetId: 'asset-legacy',
        storage: {
          kind: 'legacy-file',
          fileUrl: 'file:///C:/legacy/map.png',
          sha256: 'a'.repeat(64),
        },
        exportPolicy: 'when-used',
        createdAt: '2026-07-15T08:00:00.000Z',
        updatedAt: '2026-07-15T08:00:00.000Z',
      }),
    ).resolves.toBeUndefined()
  })
})

async function createDatabaseFilePath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'arcane-catalog-'))
  tempDirectories.push(directory)
  return path.join(directory, 'asset-catalog.sqlite')
}

function trackCatalog(catalog: SqlJsAssetCatalog): SqlJsAssetCatalog {
  openCatalogs.push(catalog)
  return catalog
}

function createSource(): AssetLibrarySource {
  return {
    id: 'asset-source-test',
    rootPath: 'C:\\art-library',
    displayName: 'Art library',
    status: 'ready',
    createdAt: '2026-07-15T08:00:00.000Z',
    updatedAt: '2026-07-15T08:00:00.000Z',
  }
}

function createAsset(sourceId: string, relativePath: string, tags: string[]): IndexedAsset {
  const fileName = path.basename(relativePath)
  return {
    id: `indexed-${fileName}`,
    sourceId,
    canonicalPath: path.join('C:\\art-library', relativePath),
    relativePath,
    fileName,
    byteSize: 2048,
    modifiedAt: '2026-07-15T08:00:00.000Z',
    kind: 'other',
    mimeType: fileName.endsWith('.webp') ? 'image/webp' : 'image/png',
    format: path.extname(fileName).slice(1),
    width: 1920,
    height: 1080,
    sha256: 'a'.repeat(64),
    previewPath: path.join('C:\\previews', `${fileName}.webp`),
    tags,
    availability: 'available',
    indexedAt: '2026-07-15T08:00:00.000Z',
  }
}
