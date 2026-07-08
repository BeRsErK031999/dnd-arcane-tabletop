import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { JsonStorageService } from './JsonStorageService.js'
import { createReferenceCampaign, referenceCampaignId, seedReferenceCampaign } from './referenceCampaignSeed.js'

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('reference campaign seed', () => {
  it('creates a filled reference campaign for the first installed run', () => {
    const campaign = createReferenceCampaign()

    expect(campaign.id).toBe(referenceCampaignId)
    expect(campaign.scenes).toHaveLength(1)
    expect(campaign.assets).toHaveLength(2)
    expect(campaign.characterCards).toHaveLength(4)
    expect(campaign.notes).toHaveLength(2)
    expect(campaign.combatState.participants).toHaveLength(4)
    expect(campaign.playerScreenState.mode).toBe('scene')
    expect(campaign.playerScreenState.sceneCanvas?.backgroundAsset?.name).toBe('Карта грота')
  })

  it('seeds once and respects user deletion afterwards', async () => {
    const directory = await createTempDirectory()
    const storage = new JsonStorageService(directory)

    await storage.initialize()
    await seedReferenceCampaign(storage, directory)

    await expect(storage.listCampaigns()).resolves.toEqual([
      expect.objectContaining({
        id: referenceCampaignId,
        sceneCount: 1,
        assetCount: 2,
        characterCount: 4,
      }),
    ])

    await storage.deleteCampaign(referenceCampaignId)
    await seedReferenceCampaign(storage, directory)

    await expect(storage.listCampaigns()).resolves.toEqual([])
  })
})

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'dnd-arcane-reference-'))
  tempDirectories.push(directory)
  return directory
}
