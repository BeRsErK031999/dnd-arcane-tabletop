import { describe, expect, it } from 'vitest'
import {
  createCampaignWithHydratedPlayerScreenState,
  createEmptyCampaign,
  createUpdatedCampaignMetadata,
} from './campaignFactory'

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
        playerViewport: { zoom: 1, panX: 0, panY: 0 },
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

  it('hydrates a legacy player viewport independently from the master scene viewport', () => {
    const campaign = createEmptyCampaign({
      id: 'campaign-test',
      name: 'Legacy',
      timestamp: '2026-07-07T00:00:00.000Z',
    })
    const legacyCampaign = {
      ...campaign,
      playerScreenState: {
        ...campaign.playerScreenState,
        playerViewport: undefined,
        sceneCanvas: {
          width: 1600,
          height: 900,
          viewport: { zoom: 0.7, panX: 90, panY: -60 },
          grid: {
            enabled: true,
            size: 70,
            color: '#8b7a5a',
            opacity: 0.35,
            distancePerCell: 5,
            unitLabel: 'ft',
            snapToGrid: true,
          },
          layers: [],
          objects: [],
          measurements: [],
          fog: { enabled: false, opacity: 0.84, regions: [] },
          updatedAt: campaign.updatedAt,
        },
      },
    } as unknown as typeof campaign

    const hydrated = createCampaignWithHydratedPlayerScreenState(legacyCampaign)

    expect(hydrated.playerScreenState.playerViewport).toEqual({ zoom: 0.7, panX: 90, panY: -60 })
    expect(hydrated.playerScreenState.sceneCanvas?.viewport).toEqual({ zoom: 0.7, panX: 90, panY: -60 })
  })
})
