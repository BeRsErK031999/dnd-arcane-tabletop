import { describe, expect, it } from 'vitest'
import { createEmptyCampaign } from './campaignFactory'
import {
  createCampaignWithActiveScene,
  createCampaignWithNewScene,
  getActiveCampaignScene,
} from './sceneFactory'
import {
  createCampaignWithActiveSceneGrid,
  createCampaignWithActiveSceneMeasurement,
  createCampaignWithActiveSceneViewport,
  createCampaignWithoutActiveSceneMeasurements,
} from './sceneToolsFactory'

describe('sceneToolsFactory', () => {
  it('updates grid settings only on the active scene', () => {
    const campaign = createCampaignFixture()

    const updated = createCampaignWithActiveSceneGrid(
      campaign,
      {
        size: 999,
        distancePerCell: 0,
        unitLabel: ' meters ',
        snapToGrid: false,
      },
      '2026-07-07T04:00:00.000Z',
    )

    expect(updated.updatedAt).toBe('2026-07-07T04:00:00.000Z')
    expect(updated.scenes.find((scene) => scene.id === 'scene-first')?.grid).toMatchObject({
      size: 70,
      distancePerCell: 5,
      unitLabel: 'ft',
      snapToGrid: true,
    })
    expect(getActiveCampaignScene(updated)?.grid).toMatchObject({
      size: 180,
      distancePerCell: 1,
      unitLabel: 'meters',
      snapToGrid: false,
    })
  })

  it('updates active scene viewport with safe bounds', () => {
    const campaign = createCampaignFixture()

    const updated = createCampaignWithActiveSceneViewport(
      campaign,
      {
        zoom: 9,
        panX: 1200,
        panY: -1200,
      },
      '2026-07-07T05:00:00.000Z',
    )

    expect(updated.updatedAt).toBe('2026-07-07T05:00:00.000Z')
    expect(updated.scenes.find((scene) => scene.id === 'scene-first')?.canvas.viewport).toEqual({
      zoom: 1,
      panX: 0,
      panY: 0,
    })
    expect(getActiveCampaignScene(updated)?.canvas.viewport).toEqual({
      zoom: 3,
      panX: 800,
      panY: -800,
    })
  })

  it('adds and clears player-visible measurement templates', () => {
    const campaign = createCampaignFixture()
    const withRuler = createCampaignWithActiveSceneMeasurement(campaign, 'ruler', '2026-07-07T06:00:00.000Z')
    const withCircle = createCampaignWithActiveSceneMeasurement(withRuler, 'circle', '2026-07-07T07:00:00.000Z')
    const activeScene = getActiveCampaignScene(withCircle)

    expect(activeScene?.canvas.measurements).toHaveLength(2)
    expect(activeScene?.canvas.measurements[0]).toMatchObject({
      kind: 'ruler',
      label: '30 ft',
      isPlayerVisible: true,
    })
    expect(activeScene?.canvas.measurements[1]).toMatchObject({
      kind: 'area',
      shape: 'circle',
      label: '20 ft',
      isPlayerVisible: true,
    })

    const cleared = createCampaignWithoutActiveSceneMeasurements(withCircle, '2026-07-07T08:00:00.000Z')

    expect(cleared.updatedAt).toBe('2026-07-07T08:00:00.000Z')
    expect(getActiveCampaignScene(cleared)?.canvas.measurements).toEqual([])
  })
})

function createCampaignFixture() {
  const campaign = createEmptyCampaign({
    id: 'campaign-test',
    name: 'Campaign',
    timestamp: '2026-07-07T00:00:00.000Z',
  })
  const withFirstScene = createCampaignWithNewScene(
    campaign,
    { id: 'scene-first', name: 'First scene' },
    '2026-07-07T01:00:00.000Z',
  )
  const withSecondScene = createCampaignWithNewScene(
    withFirstScene,
    { id: 'scene-second', name: 'Second scene' },
    '2026-07-07T02:00:00.000Z',
  )

  return createCampaignWithActiveScene(withSecondScene, 'scene-second', '2026-07-07T03:00:00.000Z')
}
