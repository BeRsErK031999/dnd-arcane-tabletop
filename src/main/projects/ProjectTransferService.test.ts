import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { Asset, Campaign } from '../../shared/types/index.js'
import { FileSystemManagedAssetStore } from '../assets/FileSystemManagedAssetStore.js'
import { SqlJsAssetCatalog } from '../assets/catalog/SqlJsAssetCatalog.js'
import { JsonStorageService } from '../storage/JsonStorageService.js'
import { createReferenceCampaign } from '../storage/referenceCampaignSeed.js'
import { ProjectTransferService } from './ProjectTransferService.js'

const tempDirectories: string[] = []
const openCatalogs: SqlJsAssetCatalog[] = []

afterEach(async () => {
  await Promise.all(openCatalogs.splice(0).map((catalog) => catalog.close()))
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('ProjectTransferService', () => {
  it('previews, exports and imports a deduplicated version 2 package', async () => {
    const sourceDirectory = await createTempDirectory()
    const targetDirectory = await createTempDirectory()
    const transferDirectory = await createTempDirectory()
    const source = await createTransferContext(sourceDirectory)
    const target = await createTransferContext(targetDirectory)
    const assetContents = Buffer.from('portable-map-binary')
    const campaign = await createCampaignWithExportPolicies(sourceDirectory, assetContents, source.managedStore)
    const packagePath = path.join(transferDirectory, 'grot.arcane-campaign')
    await source.storage.saveCampaign(campaign)

    const previewResult = await source.service.previewCampaignExport(campaign.id)
    expect(previewResult).toMatchObject({
      ok: true,
      preview: {
        usedAssetCount: 2,
        additionalAssetCount: 1,
        embeddedAssetCount: 1,
        uniqueBlobCount: 1,
        totalByteSize: expect.any(Number),
      },
    })
    if (!previewResult.ok) {
      return
    }
    expect(previewResult.preview.assets.map((asset) => asset.assetId)).toEqual([
      'asset-reference-grotto-map',
      'asset-reference-merchant-letter',
      'asset-always-copy',
    ])
    expect(previewResult.preview.assets.map((asset) => asset.storage)).toEqual([
      'managed',
      'embedded-data',
      'legacy-file',
    ])

    const exportResult = await source.service.exportCampaign(campaign.id, packagePath, previewResult.preview.token)
    expect(exportResult).toMatchObject({
      ok: true,
      campaignId: campaign.id,
      filePath: packagePath,
      exportedAssetCount: 3,
      exportedBlobCount: 1,
    })
    await expect(source.service.exportCampaign(campaign.id, packagePath, previewResult.preview.token)).resolves.toEqual({
      ok: false,
      reason: 'preview-outdated',
    })

    const projectPackage = JSON.parse(await readFile(packagePath, 'utf8')) as PortablePackageV2Fixture
    expect(projectPackage.format).toBe('dnd-arcane-tabletop-campaign')
    expect(projectPackage.version).toBe(2)
    expect(projectPackage.manifest.assets).toHaveLength(2)
    expect(projectPackage.manifest.blobs).toHaveLength(1)
    expect(projectPackage.blobs).toHaveLength(1)
    expect(projectPackage.manifest.assets[0]?.relativePath).toBe(projectPackage.manifest.assets[1]?.relativePath)
    expect(projectPackage.campaign.assets.some((asset) => asset.id === 'asset-unused')).toBe(false)
    expect(JSON.stringify(projectPackage)).not.toContain(sourceDirectory.replace(/\\/g, '\\\\'))

    const importResult = await target.service.importCampaign(packagePath)
    expect(importResult).toMatchObject({
      ok: true,
      importedAssetCount: 3,
      importedBlobCount: 1,
      deduplicatedBlobCount: 0,
      damagedBlobCount: 0,
      packageVersion: 2,
      campaignIdChanged: false,
    })
    if (!importResult.ok) {
      return
    }
    const importedFileAssets = importResult.campaign.assets.filter((asset) => asset.storageRef?.kind === 'managed')
    expect(importedFileAssets).toHaveLength(2)
    expect(importedFileAssets[0]?.filePath).toBe(importedFileAssets[1]?.filePath)
    expect(importResult.campaign.assets.find((asset) => asset.kind === 'handout')?.storageRef?.kind).toBe('embedded-data')
    await expect(readFile(fileURLToPath(importedFileAssets[0]!.filePath))).resolves.toEqual(assetContents)

    const duplicateImport = await target.service.importCampaign(packagePath)
    expect(duplicateImport).toMatchObject({
      ok: true,
      importedBlobCount: 0,
      deduplicatedBlobCount: 1,
      campaignIdChanged: true,
      packageVersion: 2,
    })
    if (duplicateImport.ok) {
      expect(duplicateImport.campaign.scenes.every((scene) => scene.campaignId === duplicateImport.campaign.id)).toBe(true)
      expect(duplicateImport.campaign.assets.every((asset) => asset.campaignId === duplicateImport.campaign.id)).toBe(true)
      expect(duplicateImport.campaign.combatState.campaignId).toBe(duplicateImport.campaign.id)
    }
  })

  it('imports a version 1 package into the managed store', async () => {
    const targetDirectory = await createTempDirectory()
    const transferDirectory = await createTempDirectory()
    const target = await createTransferContext(targetDirectory)
    const contents = Buffer.from('legacy-package-map')
    const legacyPackage = createLegacyPackage(contents)
    const packagePath = path.join(transferDirectory, 'legacy.arcane-campaign')
    await writeFile(packagePath, JSON.stringify(legacyPackage), 'utf8')

    const result = await target.service.importCampaign(packagePath)
    expect(result).toMatchObject({
      ok: true,
      importedAssetCount: 1,
      importedBlobCount: 1,
      deduplicatedBlobCount: 0,
      packageVersion: 1,
    })
    if (!result.ok) {
      return
    }
    const importedMap = result.campaign.assets[0]
    expect(importedMap?.storageRef).toMatchObject({
      kind: 'managed',
      sha256: createHash('sha256').update(contents).digest('hex'),
    })
    expect(result.campaign.playerScreenState.sceneCanvas?.backgroundAsset?.filePath).toBe(importedMap?.filePath)
    await expect(readFile(fileURLToPath(importedMap!.filePath))).resolves.toEqual(contents)
  })

  it('rejects outdated previews, unsupported versions and damaged packages before publication', async () => {
    const sourceDirectory = await createTempDirectory()
    const targetDirectory = await createTempDirectory()
    const transferDirectory = await createTempDirectory()
    const source = await createTransferContext(sourceDirectory)
    const target = await createTransferContext(targetDirectory)
    const campaign = await createCampaignWithExportPolicies(sourceDirectory, Buffer.from('original-map'))
    const packagePath = path.join(transferDirectory, 'campaign.arcane-campaign')
    await source.storage.saveCampaign(campaign)

    const stalePreview = await source.service.previewCampaignExport(campaign.id)
    if (!stalePreview.ok) {
      throw new Error('Preview unexpectedly failed')
    }
    await source.storage.saveCampaign({ ...campaign, updatedAt: '2026-07-16T00:00:00.000Z' })
    await expect(source.service.exportCampaign(campaign.id, packagePath, stalePreview.preview.token)).resolves.toEqual({
      ok: false,
      reason: 'preview-outdated',
    })

    await source.storage.saveCampaign(campaign)
    const changedFilePreview = await source.service.previewCampaignExport(campaign.id)
    if (!changedFilePreview.ok) {
      throw new Error('Preview unexpectedly failed')
    }
    await writeFile(path.join(sourceDirectory, 'grot-map.png'), Buffer.from('changed-after-preview'))
    await expect(source.service.exportCampaign(campaign.id, packagePath, changedFilePreview.preview.token)).resolves.toEqual({
      ok: false,
      reason: 'preview-outdated',
    })

    await writeFile(path.join(sourceDirectory, 'grot-map.png'), Buffer.from('original-map'))
    const preview = await source.service.previewCampaignExport(campaign.id)
    if (!preview.ok) {
      throw new Error('Preview unexpectedly failed')
    }
    await source.service.exportCampaign(campaign.id, packagePath, preview.preview.token)
    const validPackage = JSON.parse(await readFile(packagePath, 'utf8')) as PortablePackageV2Fixture

    await writeFile(packagePath, JSON.stringify({ ...validPackage, version: 999 }), 'utf8')
    await expect(target.service.importCampaign(packagePath)).resolves.toEqual({
      ok: false,
      reason: 'unsupported-version',
    })

    const damagedPackage = structuredClone(validPackage)
    damagedPackage.blobs[0]!.dataBase64 = Buffer.from('tampered').toString('base64')
    await writeFile(packagePath, JSON.stringify(damagedPackage), 'utf8')
    await expect(target.service.importCampaign(packagePath)).resolves.toEqual({
      ok: false,
      reason: 'invalid-package',
      damagedBlobCount: 1,
    })

    const unsafePackage = structuredClone(validPackage)
    unsafePackage.manifest.blobs[0]!.relativePath = '../outside.png'
    await writeFile(packagePath, JSON.stringify(unsafePackage), 'utf8')
    await expect(target.service.importCampaign(packagePath)).resolves.toEqual({
      ok: false,
      reason: 'invalid-package',
    })
    await expect(target.storage.listCampaigns()).resolves.toEqual([])
    await expect(target.catalog.listUnreferencedManagedBlobs()).resolves.toEqual([])
  })
})

interface TransferContext {
  catalog: SqlJsAssetCatalog
  managedStore: FileSystemManagedAssetStore
  storage: JsonStorageService
  service: ProjectTransferService
}

interface PortablePackageV2Fixture {
  format: string
  version: number
  campaign: Campaign
  manifest: {
    assets: Array<{ assetId: string; relativePath: string }>
    blobs: Array<{ sha256: string; relativePath: string }>
  }
  blobs: Array<{ sha256: string; relativePath: string; dataBase64: string }>
}

async function createTransferContext(directory: string): Promise<TransferContext> {
  const storage = new JsonStorageService(path.join(directory, 'campaigns'))
  const catalog = new SqlJsAssetCatalog(path.join(directory, 'asset-catalog.sqlite'))
  openCatalogs.push(catalog)
  const managedStore = new FileSystemManagedAssetStore(path.join(directory, 'managed-store'), catalog)
  await storage.initialize()
  await managedStore.initialize()
  return {
    catalog,
    managedStore,
    storage,
    service: new ProjectTransferService(storage, managedStore),
  }
}

async function createCampaignWithExportPolicies(
  directory: string,
  contents: Uint8Array,
  managedStore?: FileSystemManagedAssetStore,
): Promise<Campaign> {
  const campaign = createReferenceCampaign()
  const localAssetPath = path.join(directory, 'grot-map.png')
  const localAssetUrl = pathToFileURL(localAssetPath).toString()
  await writeFile(localAssetPath, contents)

  const [mapAsset, handoutAsset] = campaign.assets
  if (!mapAsset || !handoutAsset || !campaign.playerScreenState.sceneCanvas?.backgroundAsset) {
    throw new Error('Reference campaign is missing export fixtures')
  }
  const alwaysAsset: Asset = {
    ...mapAsset,
    id: 'asset-always-copy',
    name: 'Резервная копия карты',
    filePath: localAssetUrl,
    exportPolicy: 'always',
  }
  const unusedAsset: Asset = {
    ...mapAsset,
    id: 'asset-unused',
    name: 'Неиспользуемый ассет',
    filePath: localAssetUrl,
    exportPolicy: 'when-used',
  }
  const managedMap = managedStore
    ? await createManagedAsset(mapAsset, localAssetPath, contents, managedStore)
    : { ...mapAsset, filePath: localAssetUrl, exportPolicy: 'when-used' as const }

  return {
    ...campaign,
    assets: [
      managedMap,
      { ...handoutAsset, exportPolicy: 'when-used' },
      alwaysAsset,
      unusedAsset,
    ],
    playerScreenState: {
      ...campaign.playerScreenState,
      sceneCanvas: {
        ...campaign.playerScreenState.sceneCanvas,
        backgroundAsset: {
          ...campaign.playerScreenState.sceneCanvas.backgroundAsset,
          filePath: localAssetUrl,
        },
      },
    },
  }
}

async function createManagedAsset(
  asset: Asset,
  sourceFilePath: string,
  contents: Uint8Array,
  managedStore: FileSystemManagedAssetStore,
): Promise<Asset> {
  const sha256 = createHash('sha256').update(contents).digest('hex')
  const blob = await managedStore.put({
    sourceFilePath,
    sha256,
    byteSize: contents.byteLength,
    mimeType: 'image/png',
    fileExtension: '.png',
  })
  const fileUrl = await managedStore.resolveFileUrl(blob.sha256)
  if (!fileUrl) {
    throw new Error('Managed export fixture could not be resolved')
  }
  return {
    ...asset,
    filePath: fileUrl,
    exportPolicy: 'when-used',
    storageRef: {
      kind: 'managed',
      sha256,
      fileName: 'grot-map.png',
      mimeType: 'image/png',
      byteSize: contents.byteLength,
    },
  }
}

function createLegacyPackage(contents: Buffer): object {
  const campaign = createReferenceCampaign()
  const [mapAsset, handoutAsset] = campaign.assets
  if (!mapAsset || !handoutAsset || !campaign.playerScreenState.sceneCanvas?.backgroundAsset) {
    throw new Error('Reference campaign is missing legacy fixtures')
  }
  const portablePath = `arcane-project-asset:${encodeURIComponent(mapAsset.id)}`
  return {
    format: 'dnd-arcane-tabletop-campaign',
    version: 1,
    exportedAt: '2026-07-15T00:00:00.000Z',
    campaign: {
      ...campaign,
      assets: [{ ...mapAsset, filePath: portablePath, storageRef: undefined }, handoutAsset],
      playerScreenState: {
        ...campaign.playerScreenState,
        sceneCanvas: {
          ...campaign.playerScreenState.sceneCanvas,
          backgroundAsset: {
            ...campaign.playerScreenState.sceneCanvas.backgroundAsset,
            filePath: portablePath,
          },
        },
      },
    },
    assets: [{
      assetId: mapAsset.id,
      fileName: 'legacy-map.png',
      sha256: createHash('sha256').update(contents).digest('hex'),
      dataBase64: contents.toString('base64'),
    }],
  }
}

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'dnd-arcane-transfer-'))
  tempDirectories.push(directory)
  return directory
}
