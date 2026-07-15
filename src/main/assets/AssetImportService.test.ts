import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { AssetImportService } from './AssetImportService.js'

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('AssetImportService', () => {
  it('copies a supported image into the campaign asset folder', async () => {
    const directory = await createTempDirectory()
    const sourceDirectory = path.join(directory, 'source')
    const sourceFilePath = path.join(sourceDirectory, 'ritual-map.png')
    const service = new AssetImportService(path.join(directory, 'campaigns'), async () => null)

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
    expect(copiedFilePath).toContain(path.join('campaign-test', 'assets'))
    expect(result.asset).toMatchObject({
      campaignId: 'campaign-test',
      kind: 'map',
      name: 'Карта ритуального зала',
      tags: ['ночь', 'ритуал'],
      storageRef: {
        kind: 'legacy-file',
        fileUrl: result.asset.filePath,
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
    const service = new AssetImportService(path.join(directory, 'campaigns'), async () => null)

    await writeFile(sourceFilePath, 'not an image')

    await expect(
      service.importImageAsset({
        campaignId: 'campaign-test',
        kind: 'handout',
        sourceFilePath,
      }),
    ).resolves.toEqual({ ok: false, reason: 'unsupported-file' })
  })

  it('uses the latest campaign directory provider value for copied assets', async () => {
    const directory = await createTempDirectory()
    const sourceFilePath = path.join(directory, 'portrait.png')
    let campaignsDirectory = path.join(directory, 'campaigns-a')
    const service = new AssetImportService(() => campaignsDirectory, async () => null)

    await writeFile(sourceFilePath, 'portrait-content')
    campaignsDirectory = path.join(directory, 'campaigns-b')

    const result = await service.importImageAsset({
      campaignId: 'campaign-test',
      kind: 'portrait',
      sourceFilePath,
    })

    expect(result.ok).toBe(true)

    if (!result.ok) {
      return
    }

    const copiedFilePath = fileURLToPath(result.asset.filePath)
    expect(copiedFilePath).toContain(path.join('campaigns-b', 'campaign-test', 'assets'))
    await expect(readFile(copiedFilePath, 'utf8')).resolves.toBe('portrait-content')
  })
})

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'dnd-arcane-assets-'))
  tempDirectories.push(directory)
  return directory
}
