import { describe, expect, it } from 'vitest'
import { createEmptyCampaign, createUpdatedCampaignMetadata } from './campaignFactory'

describe('campaignFactory', () => {
  it('creates an empty campaign with replaceable JSON storage shape', () => {
    const campaign = createEmptyCampaign({
      id: 'campaign-test',
      name: '  Гробница короля  ',
      description: '  Первый акт  ',
      timestamp: '2026-07-07T00:00:00.000Z',
    })

    expect(campaign).toMatchObject({
      id: 'campaign-test',
      name: 'Гробница короля',
      description: 'Первый акт',
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T00:00:00.000Z',
      scenes: [],
      assets: [],
      characterCards: [],
      notes: [],
      combatState: {
        campaignId: 'campaign-test',
        isActive: false,
        round: 0,
        turnIndex: 0,
        participants: [],
      },
      playerScreenState: {
        campaignId: 'campaign-test',
        mode: 'blank',
        isHidden: false,
      },
    })
  })

  it('updates only editable campaign metadata', () => {
    const campaign = createEmptyCampaign({
      id: 'campaign-test',
      name: 'Old name',
      timestamp: '2026-07-07T00:00:00.000Z',
    })

    const updated = createUpdatedCampaignMetadata(
      campaign,
      '  New name  ',
      '  ',
      '2026-07-07T01:00:00.000Z',
    )

    expect(updated).toMatchObject({
      id: 'campaign-test',
      name: 'New name',
      description: undefined,
      createdAt: '2026-07-07T00:00:00.000Z',
      updatedAt: '2026-07-07T01:00:00.000Z',
    })
    expect(updated.scenes).toBe(campaign.scenes)
    expect(updated.assets).toBe(campaign.assets)
  })

  it('uses a readable default name for blank campaign titles', () => {
    const campaign = createEmptyCampaign({
      id: 'campaign-test',
      name: '   ',
      timestamp: '2026-07-07T00:00:00.000Z',
    })

    expect(campaign.name).toBe('Новая кампания')
  })
})
