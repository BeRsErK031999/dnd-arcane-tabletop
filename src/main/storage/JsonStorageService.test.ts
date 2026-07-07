import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Campaign } from '../../shared/types/index.js'
import { JsonStorageService } from './JsonStorageService.js'

const tempDirectories: string[] = []

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('JsonStorageService', () => {
  it('saves and loads campaigns from JSON files', async () => {
    const directory = await createTempDirectory()
    const storage = new JsonStorageService(directory)
    const campaign = createCampaignFixture()

    await storage.initialize()
    await storage.saveCampaign(campaign)

    await expect(storage.loadCampaign(campaign.id)).resolves.toEqual(campaign)
    await expect(storage.listCampaigns()).resolves.toEqual([
      {
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        updatedAt: campaign.updatedAt,
        sceneCount: 0,
        assetCount: 0,
        characterCount: 0,
      },
    ])
  })

  it('rejects unsafe campaign file names', async () => {
    const directory = await createTempDirectory()
    const storage = new JsonStorageService(directory)

    await storage.initialize()

    await expect(storage.loadCampaign('../outside')).rejects.toThrow('Invalid campaign id')
  })
})

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'dnd-arcane-tabletop-'))
  tempDirectories.push(directory)
  return directory
}

function createCampaignFixture(): Campaign {
  const timestamp = '2026-07-07T00:00:00.000Z'

  return {
    id: 'campaign-1',
    name: 'Lost Mine',
    description: 'Starter campaign',
    createdAt: timestamp,
    updatedAt: timestamp,
    scenes: [],
    assets: [],
    characterCards: [],
    notes: [],
    combatState: {
      campaignId: 'campaign-1',
      isActive: false,
      round: 0,
      turnIndex: 0,
      participants: [],
    },
    playerScreenState: {
      campaignId: 'campaign-1',
      visibleTokenIds: [],
      revealedAssetIds: [],
      showInitiativeTracker: false,
      updatedAt: timestamp,
    },
  }
}
