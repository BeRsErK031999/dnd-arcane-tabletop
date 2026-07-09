import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createDefaultPlayerScreenState, type Campaign } from '../../shared/types/index.js'
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

  it('switches the campaign directory for subsequent reads and writes', async () => {
    const firstDirectory = await createTempDirectory()
    const secondDirectory = await createTempDirectory()
    const storage = new JsonStorageService(firstDirectory)
    const campaign = createCampaignFixture()

    await storage.saveCampaign(campaign)
    await storage.setCampaignsDirectory(secondDirectory)

    expect(storage.getCampaignsDirectory()).toBe(path.resolve(secondDirectory))
    await expect(storage.listCampaigns()).resolves.toEqual([])

    await storage.saveCampaign({ ...campaign, id: 'campaign-2', name: 'Second campaign' })
    await expect(storage.listCampaigns()).resolves.toEqual([
      expect.objectContaining({
        id: 'campaign-2',
        name: 'Second campaign',
      }),
    ])

    await storage.setCampaignsDirectory(firstDirectory)
    await expect(storage.listCampaigns()).resolves.toEqual([
      expect.objectContaining({
        id: campaign.id,
        name: campaign.name,
      }),
    ])
  })

  it('keeps two rotated backup copies outside the campaign list', async () => {
    const directory = await createTempDirectory()
    const storage = new JsonStorageService(directory)
    const campaign = createCampaignFixture()

    await storage.initialize()
    await storage.saveCampaign(campaign)
    await storage.saveCampaign({ ...campaign, name: 'Lost Mine v2', updatedAt: '2026-07-07T00:01:00.000Z' })
    await storage.saveCampaign({ ...campaign, name: 'Lost Mine v3', updatedAt: '2026-07-07T00:02:00.000Z' })
    await storage.saveCampaign({ ...campaign, name: 'Lost Mine v4', updatedAt: '2026-07-07T00:03:00.000Z' })

    const backupDirectory = path.join(directory, '.backups')
    expect((await readdir(backupDirectory)).sort()).toEqual(['campaign-1.backup-1.json', 'campaign-1.backup-2.json'])

    const firstBackup = JSON.parse(
      await readFile(path.join(backupDirectory, 'campaign-1.backup-1.json'), 'utf8'),
    ) as Campaign
    const secondBackup = JSON.parse(
      await readFile(path.join(backupDirectory, 'campaign-1.backup-2.json'), 'utf8'),
    ) as Campaign

    expect(firstBackup.name).toBe('Lost Mine v3')
    expect(secondBackup.name).toBe('Lost Mine v2')
    await expect(storage.listCampaigns()).resolves.toHaveLength(1)
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
      ...createDefaultPlayerScreenState(timestamp),
      campaignId: 'campaign-1',
    },
  }
}
