import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import type { Campaign } from '../../shared/types/index.js'
import { JsonStorageService } from '../storage/JsonStorageService.js'
import { createReferenceCampaign } from '../storage/referenceCampaignSeed.js'
import { ProjectTransferService } from './ProjectTransferService.js'

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('ProjectTransferService', () => {
  it('exports and imports a versioned autonomous package with SHA-256 asset integrity', async () => {
    const sourceDirectory = await createTempDirectory()
    const targetDirectory = await createTempDirectory()
    const transferDirectory = await createTempDirectory()
    const sourceStorage = new JsonStorageService(sourceDirectory)
    const targetStorage = new JsonStorageService(targetDirectory)
    const transferService = new ProjectTransferService(sourceStorage)
    const assetContents = Buffer.from('portable-map-binary')
    const campaign = await createCampaignWithLocalMap(sourceDirectory, assetContents)
    const packagePath = path.join(transferDirectory, 'grot.arcane-campaign')

    await sourceStorage.initialize()
    await targetStorage.initialize()
    await sourceStorage.saveCampaign(campaign)

    const exportResult = await transferService.exportCampaign(campaign.id, packagePath)

    expect(exportResult).toEqual({
      ok: true,
      campaignId: campaign.id,
      filePath: packagePath,
      exportedAssetCount: 1,
    })
    await expect(transferService.exportCampaign(campaign.id, packagePath)).resolves.toMatchObject({ ok: true })

    const projectPackage = JSON.parse(await readFile(packagePath, 'utf8')) as PortablePackageFixture
    expect(projectPackage.format).toBe('dnd-arcane-tabletop-campaign')
    expect(projectPackage.version).toBe(1)
    expect(projectPackage.assets).toEqual([
      expect.objectContaining({
        assetId: campaign.assets[0]?.id,
        fileName: 'grot-map.png',
        sha256: createHash('sha256').update(assetContents).digest('hex'),
        dataBase64: assetContents.toString('base64'),
      }),
    ])
    expect(projectPackage.campaign.assets[0]?.filePath).toBe(
      `arcane-project-asset:${encodeURIComponent(campaign.assets[0]?.id ?? '')}`,
    )
    expect(projectPackage.campaign.assets[0]?.storageRef).toBeUndefined()

    const importResult = await new ProjectTransferService(targetStorage).importCampaign(packagePath)

    expect(importResult.ok).toBe(true)

    if (!importResult.ok) {
      return
    }

    expect(importResult.campaignIdChanged).toBe(false)
    expect(importResult.importedAssetCount).toBe(1)
    const importedMap = importResult.campaign.assets[0]
    expect(importedMap?.filePath.startsWith('file:')).toBe(true)

    if (!importedMap) {
      throw new Error('Imported campaign is missing its map asset')
    }

    await expect(readFile(fileURLToPath(importedMap.filePath))).resolves.toEqual(assetContents)
    expect(importedMap.storageRef).toEqual({ kind: 'legacy-file', fileUrl: importedMap.filePath })
    expect(importResult.campaign.playerScreenState.sceneCanvas?.backgroundAsset?.filePath).toBe(importedMap.filePath)
    expect(importResult.campaign.assets[1]?.filePath.startsWith('data:')).toBe(true)
    expect(importResult.campaign.assets[1]?.storageRef?.kind).toBe('embedded-data')
    await expect(targetStorage.loadCampaign(campaign.id)).resolves.toEqual(importResult.campaign)
  })

  it('assigns a new campaign id on conflict and rewrites every campaign-owned entity', async () => {
    const directory = await createTempDirectory()
    const transferDirectory = await createTempDirectory()
    const storage = new JsonStorageService(directory)
    const campaign = await createCampaignWithLocalMap(directory, Buffer.from('conflict-map'))
    const packagePath = path.join(transferDirectory, 'conflict.arcane-campaign')
    const transferService = new ProjectTransferService(storage)

    await storage.initialize()
    await storage.saveCampaign(campaign)
    await expect(transferService.exportCampaign(campaign.id, packagePath)).resolves.toMatchObject({ ok: true })

    const importResult = await transferService.importCampaign(packagePath)

    expect(importResult.ok).toBe(true)

    if (!importResult.ok) {
      return
    }

    expect(importResult.campaignIdChanged).toBe(true)
    expect(importResult.campaign.id).not.toBe(campaign.id)
    expect(importResult.campaign.scenes.every((scene) => scene.campaignId === importResult.campaign.id)).toBe(true)
    expect(importResult.campaign.assets.every((asset) => asset.campaignId === importResult.campaign.id)).toBe(true)
    expect(importResult.campaign.characterCards.every((card) => card.campaignId === importResult.campaign.id)).toBe(true)
    expect(importResult.campaign.notes.every((note) => note.campaignId === importResult.campaign.id)).toBe(true)
    expect(importResult.campaign.combatState.campaignId).toBe(importResult.campaign.id)
    expect(importResult.campaign.playerScreenState.campaignId).toBe(importResult.campaign.id)
    await expect(storage.loadCampaign(campaign.id)).resolves.toMatchObject({
      id: campaign.id,
      name: campaign.name,
      assets: [
        expect.objectContaining({
          id: campaign.assets[0]?.id,
          filePath: campaign.assets[0]?.filePath,
        }),
        expect.objectContaining({ id: campaign.assets[1]?.id }),
      ],
    })
    await expect(storage.loadCampaign(importResult.campaign.id)).resolves.toEqual(importResult.campaign)
  })

  it('rejects unsupported versions, tampered asset bytes, and unsafe projection paths', async () => {
    const sourceDirectory = await createTempDirectory()
    const targetDirectory = await createTempDirectory()
    const transferDirectory = await createTempDirectory()
    const sourceStorage = new JsonStorageService(sourceDirectory)
    const targetStorage = new JsonStorageService(targetDirectory)
    const assetContents = Buffer.from('original-map')
    const campaign = await createCampaignWithLocalMap(sourceDirectory, assetContents)
    const packagePath = path.join(transferDirectory, 'campaign.arcane-campaign')

    await sourceStorage.initialize()
    await targetStorage.initialize()
    await sourceStorage.saveCampaign(campaign)
    await new ProjectTransferService(sourceStorage).exportCampaign(campaign.id, packagePath)

    const projectPackage = JSON.parse(await readFile(packagePath, 'utf8')) as PortablePackageFixture
    await writeFile(packagePath, JSON.stringify({ ...projectPackage, version: 999 }), 'utf8')
    await expect(new ProjectTransferService(targetStorage).importCampaign(packagePath)).resolves.toEqual({
      ok: false,
      reason: 'unsupported-version',
    })

    const [portableAsset] = projectPackage.assets

    if (!portableAsset) {
      throw new Error('Exported package is missing its portable asset')
    }

    portableAsset.dataBase64 = Buffer.from('tampered-map').toString('base64')
    await writeFile(packagePath, JSON.stringify(projectPackage), 'utf8')
    await expect(new ProjectTransferService(targetStorage).importCampaign(packagePath)).resolves.toEqual({
      ok: false,
      reason: 'invalid-package',
    })

    portableAsset.dataBase64 = assetContents.toString('base64')
    const embeddedAsset = projectPackage.campaign.assets[1]

    if (!embeddedAsset) {
      throw new Error('Exported package is missing its embedded asset')
    }

    embeddedAsset.storageRef = {
      kind: 'legacy-file',
      fileUrl: 'file:///outside-library/secret.png',
    }
    await writeFile(packagePath, JSON.stringify(projectPackage), 'utf8')
    await expect(new ProjectTransferService(targetStorage).importCampaign(packagePath)).resolves.toEqual({
      ok: false,
      reason: 'invalid-package',
    })

    embeddedAsset.storageRef = {
      kind: 'embedded-data',
    }
    const projectedMap = projectPackage.campaign.playerScreenState.sceneCanvas?.backgroundAsset

    if (!projectedMap) {
      throw new Error('Exported package is missing its projected map')
    }

    projectedMap.filePath = 'file:///outside-library/map.png'
    await writeFile(packagePath, JSON.stringify(projectPackage), 'utf8')
    await expect(new ProjectTransferService(targetStorage).importCampaign(packagePath)).resolves.toEqual({
      ok: false,
      reason: 'invalid-package',
    })
    await expect(targetStorage.listCampaigns()).resolves.toEqual([])
  })
})

interface PortablePackageFixture {
  format: string
  version: number
  campaign: Campaign
  assets: Array<{
    assetId: string
    fileName: string
    sha256: string
    dataBase64: string
  }>
}

async function createCampaignWithLocalMap(directory: string, contents: Uint8Array): Promise<Campaign> {
  const campaign = createReferenceCampaign()
  const localAssetPath = path.join(directory, 'grot-map.png')
  const localAssetUrl = pathToFileURL(localAssetPath).toString()

  await writeFile(localAssetPath, contents)

  const [mapAsset, ...otherAssets] = campaign.assets

  if (!mapAsset || !campaign.playerScreenState.sceneCanvas?.backgroundAsset) {
    throw new Error('Reference campaign is missing its map projection')
  }

  return {
    ...campaign,
    assets: [{ ...mapAsset, filePath: localAssetUrl }, ...otherAssets],
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

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'dnd-arcane-transfer-'))
  tempDirectories.push(directory)
  return directory
}
