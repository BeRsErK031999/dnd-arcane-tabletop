import { describe, expect, it } from 'vitest'
import { createEmptyCampaign } from './campaignFactory'
import {
  createCampaignWithActiveScene,
  createCampaignWithNewScene,
  createCampaignWithScenePreview,
  createEmptyScene,
  getActiveCampaignScene,
} from './sceneFactory'

describe('sceneFactory', () => {
  it('creates an empty scene with stage 7 defaults', () => {
    const scene = createEmptyScene({
      campaignId: 'campaign-test',
      id: 'scene-test',
      name: '  Ритуальный зал  ',
      description: '  Светятся семь колонн  ',
      isActive: true,
    })

    expect(scene).toMatchObject({
      id: 'scene-test',
      campaignId: 'campaign-test',
      name: 'Ритуальный зал',
      description: 'Светятся семь колонн',
      canvas: {
        width: 1600,
        height: 900,
      },
      tokens: [],
      grid: {
        enabled: true,
        size: 70,
        distancePerCell: 5,
        unitLabel: 'ft',
        snapToGrid: true,
      },
      isActive: true,
    })
  })

  it('activates the first campaign scene and keeps the player screen in selection mode', () => {
    const campaign = createEmptyCampaign({
      id: 'campaign-test',
      name: 'Campaign',
      timestamp: '2026-07-07T00:00:00.000Z',
    })

    const updated = createCampaignWithNewScene(
      campaign,
      {
        id: 'scene-first',
        name: 'Первая сцена',
      },
      '2026-07-07T01:00:00.000Z',
    )

    expect(updated.scenes).toHaveLength(1)
    expect(updated.scenes[0]).toMatchObject({
      id: 'scene-first',
      isActive: true,
    })
    expect(updated.playerScreenState).toMatchObject({
      mode: 'blank',
      campaignId: 'campaign-test',
      activeSceneId: 'scene-first',
      scenePreview: {
        id: 'scene-first',
        name: 'Первая сцена',
      },
    })
  })

  it('switches the active scene and keeps canvas data hydrated', () => {
    const campaign = createEmptyCampaign({
      id: 'campaign-test',
      name: 'Campaign',
      timestamp: '2026-07-07T00:00:00.000Z',
    })
    const withFirstScene = createCampaignWithNewScene(campaign, { id: 'scene-first', name: 'Первая' })
    const withSecondScene = createCampaignWithNewScene(withFirstScene, { id: 'scene-second', name: 'Вторая' })

    const updated = createCampaignWithActiveScene(withSecondScene, 'scene-second', '2026-07-07T02:00:00.000Z')

    expect(updated.scenes.map((scene) => [scene.id, scene.isActive])).toEqual([
      ['scene-first', false],
      ['scene-second', true],
    ])
    expect(updated.playerScreenState.activeSceneId).toBe('scene-second')
    expect(getActiveCampaignScene(updated)?.id).toBe('scene-second')
    expect(updated.scenes.every((scene) => scene.tokens.length === 0)).toBe(true)
    expect(updated.scenes.every((scene) => scene.canvas.layers.length > 0)).toBe(true)
  })

  it('builds a player scene preview from the active scene', () => {
    const campaign = createEmptyCampaign({
      id: 'campaign-test',
      name: 'Campaign',
      timestamp: '2026-07-07T00:00:00.000Z',
    })
    const withScene = createCampaignWithNewScene(campaign, {
      id: 'scene-first',
      name: 'Северная башня',
      description: 'Окна выходят на шторм.',
    })

    const updated = createCampaignWithScenePreview(withScene, 'scene-first', '2026-07-07T03:00:00.000Z')

    expect(updated.playerScreenState).toMatchObject({
      mode: 'scene',
      isHidden: false,
      title: 'Северная башня',
      message: 'Окна выходят на шторм.',
      campaignId: 'campaign-test',
      activeSceneId: 'scene-first',
      scenePreview: {
        id: 'scene-first',
        name: 'Северная башня',
        description: 'Окна выходят на шторм.',
        locationLabel: 'Сцена кампании',
      },
      sceneCanvas: {
        width: 1600,
        height: 900,
      },
    })
  })
})
