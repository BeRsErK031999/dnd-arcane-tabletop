import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { SqlJsAssetCatalog } from './catalog/SqlJsAssetCatalog.js'
import { FileSystemManagedAssetStore, ManagedAssetStoreError } from './FileSystemManagedAssetStore.js'

const tempDirectories: string[] = []
const openCatalogs: SqlJsAssetCatalog[] = []

afterEach(async () => {
  await Promise.all(openCatalogs.splice(0).map((catalog) => catalog.close()))
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('FileSystemManagedAssetStore', () => {
  it('installs a verified content-addressed blob that survives loss of the source', async () => {
    const context = await createContext()
    const sourceFilePath = path.join(context.directory, 'source-map.png')
    const contents = Buffer.from('managed-map-content')
    const sha256 = digest(contents)
    await writeFile(sourceFilePath, contents)

    const blob = await context.store.put({
      sourceFilePath,
      sha256,
      byteSize: contents.length,
      mimeType: 'image/png',
      fileExtension: '.PNG',
    })

    expect(blob.relativePath).toBe(`objects/${sha256.slice(0, 2)}/${sha256.slice(2, 4)}/${sha256}.png`)
    await expect(context.store.verify(sha256)).resolves.toBe(true)
    await rm(sourceFilePath)

    const fileUrl = await context.store.resolveFileUrl(sha256)
    expect(fileUrl).not.toBeNull()
    await expect(readFile(fileURLToPath(fileUrl!))).resolves.toEqual(contents)
  })

  it('deduplicates equal content and keeps the first stable object path', async () => {
    const context = await createContext()
    const firstPath = path.join(context.directory, 'map.png')
    const secondPath = path.join(context.directory, 'same-map.jpg')
    const contents = Buffer.from('same-content')
    const sha256 = digest(contents)
    await writeFile(firstPath, contents)
    await writeFile(secondPath, contents)

    const first = await context.store.put({
      sourceFilePath: firstPath,
      sha256,
      byteSize: contents.length,
      mimeType: 'image/png',
      fileExtension: '.png',
    })
    const second = await context.store.put({
      sourceFilePath: secondPath,
      sha256,
      byteSize: contents.length,
      mimeType: 'image/jpeg',
      fileExtension: '.jpg',
    })

    expect(second.relativePath).toBe(first.relativePath)
    await expect(context.catalog.listUnreferencedManagedBlobs()).resolves.toEqual([second])
  })

  it('rejects a source that changed after its checksum was recorded', async () => {
    const context = await createContext()
    const sourceFilePath = path.join(context.directory, 'changed.png')
    const indexedContents = Buffer.from('map-v1')
    await writeFile(sourceFilePath, 'map-v2')
    const sha256 = digest(indexedContents)

    await expect(
      context.store.put({
        sourceFilePath,
        sha256,
        byteSize: indexedContents.length,
        mimeType: 'image/png',
        fileExtension: '.png',
      }),
    ).rejects.toMatchObject<Partial<ManagedAssetStoreError>>({ code: 'source-changed' })
    await expect(context.catalog.getManagedBlob(sha256)).resolves.toBeNull()
  })

  it('repairs a corrupted managed blob from a still-available indexed source', async () => {
    const context = await createContext()
    const sourceFilePath = path.join(context.directory, 'repair-source.png')
    const contents = Buffer.from('verified-original-content')
    const sha256 = digest(contents)
    await writeFile(sourceFilePath, contents)
    const first = await context.store.put({
      sourceFilePath,
      sha256,
      byteSize: contents.length,
      mimeType: 'image/png',
      fileExtension: '.png',
    })
    const managedFilePath = fileURLToPath((await context.store.resolveFileUrl(sha256))!)
    await writeFile(managedFilePath, 'corrupted')

    const repaired = await context.store.put({
      sourceFilePath,
      sha256,
      byteSize: contents.length,
      mimeType: 'image/png',
      fileExtension: '.png',
    })

    expect(repaired.relativePath).toBe(first.relativePath)
    await expect(context.store.verify(sha256)).resolves.toBe(true)
    await expect(readFile(managedFilePath)).resolves.toEqual(contents)
  })

  it('deletes only blobs that remain unreferenced at collection time', async () => {
    const context = await createContext()
    const sourceFilePath = path.join(context.directory, 'handout.webp')
    const contents = Buffer.from('handout-content')
    const sha256 = digest(contents)
    await writeFile(sourceFilePath, contents)
    const blob = await context.store.put({
      sourceFilePath,
      sha256,
      byteSize: contents.length,
      mimeType: 'image/webp',
      fileExtension: '.webp',
    })
    await context.catalog.saveCampaignAssetBinding({
      campaignId: 'campaign-test',
      assetId: 'asset-handout',
      storage: {
        kind: 'managed',
        sha256,
        fileName: 'handout.webp',
        mimeType: blob.mimeType,
        byteSize: blob.byteSize,
      },
      exportPolicy: 'when-used',
      createdAt: '2026-07-15T12:00:00.000Z',
      updatedAt: '2026-07-15T12:00:00.000Z',
    })

    await expect(context.store.deleteIfUnreferenced(sha256)).resolves.toBeNull()
    expect(await context.store.resolveFileUrl(sha256)).not.toBeNull()

    await context.catalog.removeCampaignAssetBindings('campaign-test')
    await expect(context.store.deleteIfUnreferenced(sha256)).resolves.toMatchObject({ sha256 })
    await expect(context.store.resolveFileUrl(sha256)).resolves.toBeNull()
  })
})

async function createContext(): Promise<{
  catalog: SqlJsAssetCatalog
  directory: string
  store: FileSystemManagedAssetStore
}> {
  const directory = await mkdtemp(path.join(tmpdir(), 'arcane-managed-store-'))
  tempDirectories.push(directory)
  const catalog = new SqlJsAssetCatalog(path.join(directory, 'catalog.sqlite'))
  openCatalogs.push(catalog)
  const store = new FileSystemManagedAssetStore(path.join(directory, 'managed'), catalog)
  return { catalog, directory, store }
}

function digest(contents: Buffer): string {
  return createHash('sha256').update(contents).digest('hex')
}
