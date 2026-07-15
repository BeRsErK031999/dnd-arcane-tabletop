import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { SqlJsAssetCatalog } from './catalog/SqlJsAssetCatalog.js'
import { FileSystemManagedAssetStore } from './FileSystemManagedAssetStore.js'
import { AssetImportService } from './AssetImportService.js'

const tempDirectories: string[] = []
const openCatalogs: SqlJsAssetCatalog[] = []

afterEach(async () => {
  await Promise.all(openCatalogs.splice(0).map((catalog) => catalog.close()))
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('AssetImportService', () => {
  it('copies a supported image into the managed content-addressed store', async () => {
    const directory = await createTempDirectory()
    const sourceDirectory = path.join(directory, 'source')
    const sourceFilePath = path.join(sourceDirectory, 'ritual-map.png')
    const { service } = createService(directory)

    await mkdir(sourceDirectory)
    await writeFile(sourceFilePath, 'fake-image-content')

    const result = await service.importImageAsset({
      campaignId: 'campaign-test',
      kind: 'map',
      suggestedName: '  Карта ритуального зала  ',
      tags: [' ночь ', 'ритуал', 'ночь', ''],
      sourceFilePath,
    })

    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    const copiedFilePath = fileURLToPath(result.asset.filePath)
    await expect(readFile(copiedFilePath, 'utf8')).resolves.toBe('fake-image-content')
    expect(copiedFilePath).toContain(path.join('managed-store', 'objects'))
    expect(result.asset).toMatchObject({
      campaignId: 'campaign-test',
      kind: 'map',
      name: 'Карта ритуального зала',
      tags: ['ночь', 'ритуал'],
      storageRef: {
        kind: 'managed',
        fileName: 'ritual-map.png',
        mimeType: 'image/png',
        byteSize: 18,
      },
      exportPolicy: 'when-used',
      metadata: {
        originalFileName: 'ritual-map.png',
        fileExtension: 'png',
      },
    })
  })

  it('rejects unsupported image extensions before copying', async () => {
    const directory = await createTempDirectory()
    const sourceFilePath = path.join(directory, 'notes.txt')
    const { service } = createService(directory)

    await writeFile(sourceFilePath, 'not an image')

    await expect(
      service.importImageAsset({
        campaignId: 'campaign-test',
        kind: 'handout',
        sourceFilePath,
      }),
    ).resolves.toEqual({ ok: false, reason: 'unsupported-file' })
  })

  it('deduplicates identical imports across campaigns', async () => {
    const directory = await createTempDirectory()
    const sourceFilePath = path.join(directory, 'portrait.png')
    const { catalog, service } = createService(directory)

    await writeFile(sourceFilePath, 'portrait-content')
    const first = await service.importImageAsset({
      campaignId: 'campaign-a',
      kind: 'portrait',
      sourceFilePath,
    })
    const second = await service.importImageAsset({
      campaignId: 'campaign-b',
      kind: 'portrait',
      sourceFilePath,
    })

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) {
      return
    }

    expect(first.asset.filePath).toBe(second.asset.filePath)
    expect(first.asset.storageRef).toMatchObject(second.asset.storageRef!)
    await expect(catalog.listUnreferencedManagedBlobs()).resolves.toHaveLength(0)
  })
})

function createService(directory: string): {
  catalog: SqlJsAssetCatalog
  service: AssetImportService
} {
  const catalog = new SqlJsAssetCatalog(path.join(directory, 'asset-catalog.sqlite'))
  openCatalogs.push(catalog)
  const managedStore = new FileSystemManagedAssetStore(path.join(directory, 'managed-store'), catalog)
  return {
    catalog,
    service: new AssetImportService(managedStore, async () => null, catalog),
  }
}

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'dnd-arcane-assets-'))
  tempDirectories.push(directory)
  return directory
}
