import { describe, expect, it } from 'vitest'
import type { Campaign, SceneCanvasObject } from '@shared/types'
import { createEmptyCampaign } from './campaignFactory'
import {
  createCampaignWithActiveScene,
  createCampaignWithNewScene,
  getActiveCampaignScene,
} from './sceneFactory'
import {
  createCampaignWithActiveSceneGrid,
  createCampaignWithActiveSceneFog,
  createCampaignWithActiveSceneFogRegion,
  createCampaignWithActiveSceneMeasurement,
  createCampaignWithActiveSceneObjectTokenState,
  createCampaignWithActiveSceneObjectVisibility,
  createCampaignWithActiveSceneViewport,
  createCampaignWithDuplicatedActiveSceneObject,
  createCampaignWithMovedActiveSceneObject,
  createCampaignWithPositionedActiveSceneObject,
  createCampaignWithUpdatedActiveSceneFogRegion,
  createCampaignWithoutActiveSceneFogRegions,
  createCampaignWithoutActiveSceneMeasurements,
  createCampaignWithoutLastActiveSceneFogRegion,
} from './sceneToolsFactory'
import { getSceneCanvasState } from './sceneCanvasFactory'

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
      unitLabel: 'm',
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

  it('adds player-visible measurements from canvas coordinates', () => {
    const campaign = createCampaignFixture()
    const updated = createCampaignWithActiveSceneMeasurement(
      campaign,
      {
        template: 'ruler',
        originX: 142,
        originY: 142,
        targetX: 354,
        targetY: 142,
      },
      '2026-07-07T06:30:00.000Z',
    )
    const measurement = getActiveCampaignScene(updated)?.canvas.measurements[0]

    expect(updated.updatedAt).toBe('2026-07-07T06:30:00.000Z')
    expect(measurement).toMatchObject({
      kind: 'ruler',
      originX: 140,
      originY: 140,
      targetX: 350,
      targetY: 140,
      label: '15 ft',
      isPlayerVisible: true,
    })
  })

  it('manages fog regions on the active scene only', () => {
    const campaign = createCampaignFixture()
    const withSettings = createCampaignWithActiveSceneFog(
      campaign,
      {
        enabled: true,
        opacity: 2,
      },
      '2026-07-07T08:10:00.000Z',
    )
    const withRectangle = createCampaignWithActiveSceneFogRegion(
      withSettings,
      'rectangle',
      '2026-07-07T08:20:00.000Z',
    )
    const withCircle = createCampaignWithActiveSceneFogRegion(
      withRectangle,
      'circle',
      '2026-07-07T08:30:00.000Z',
    )
    const inactiveScene = withCircle.scenes.find((scene) => scene.id === 'scene-first')
    const activeCanvas = getSceneCanvasState(getActiveCampaignScene(withCircle)!)

    expect(withCircle.updatedAt).toBe('2026-07-07T08:30:00.000Z')
    expect(inactiveScene?.canvas.fog.enabled).toBe(false)
    expect(activeCanvas.fog).toMatchObject({
      enabled: true,
      opacity: 0.96,
    })
    expect(activeCanvas.fog.regions.map((region) => region.shape)).toEqual(['rectangle', 'circle'])
    expect(activeCanvas.layers.find((layer) => layer.kind === 'fog')).toMatchObject({
      visibility: 'player-visible',
    })

    const withoutLast = createCampaignWithoutLastActiveSceneFogRegion(
      withCircle,
      '2026-07-07T08:40:00.000Z',
    )

    expect(getSceneCanvasState(getActiveCampaignScene(withoutLast)!).fog.regions).toHaveLength(1)

    const cleared = createCampaignWithoutActiveSceneFogRegions(withoutLast, '2026-07-07T08:50:00.000Z')
    const clearedCanvas = getSceneCanvasState(getActiveCampaignScene(cleared)!)

    expect(cleared.updatedAt).toBe('2026-07-07T08:50:00.000Z')
    expect(clearedCanvas.fog).toMatchObject({
      enabled: false,
      regions: [],
    })
    expect(clearedCanvas.layers.find((layer) => layer.kind === 'fog')).toMatchObject({
      visibility: 'disabled',
    })
  })

  it('adds and updates fog regions from canvas coordinates', () => {
    const campaign = createCampaignFixture()
    const withRegion = createCampaignWithActiveSceneFogRegion(
      campaign,
      {
        shape: 'rectangle',
        x: 142,
        y: 214,
        width: 286,
        height: 144,
      },
      '2026-07-07T08:25:00.000Z',
    )
    const region = getSceneCanvasState(getActiveCampaignScene(withRegion)!).fog.regions[0]

    expect(region).toMatchObject({
      shape: 'rectangle',
      x: 140,
      y: 210,
      width: 280,
      height: 140,
    })

    const updated = createCampaignWithUpdatedActiveSceneFogRegion(
      withRegion,
      region.id,
      {
        x: 1530,
        y: 860,
        width: 210,
        height: 140,
      },
      '2026-07-07T08:35:00.000Z',
    )
    const updatedRegion = getSceneCanvasState(getActiveCampaignScene(updated)!).fog.regions[0]

    expect(updated.updatedAt).toBe('2026-07-07T08:35:00.000Z')
    expect(updatedRegion).toMatchObject({
      x: 1390,
      y: 760,
      width: 210,
      height: 140,
    })
  })

  it('moves active scene objects with grid snapping', () => {
    const campaign = createCampaignWithTokenObjectFixture()

    const updated = createCampaignWithMovedActiveSceneObject(
      campaign,
      'object-token',
      'right',
      '2026-07-07T09:00:00.000Z',
    )
    const object = getSceneCanvasState(getActiveCampaignScene(updated)!).objects.find(
      (candidate) => candidate.id === 'object-token',
    )

    expect(updated.updatedAt).toBe('2026-07-07T09:00:00.000Z')
    expect(object).toMatchObject({
      x: 210,
      y: 140,
    })
  })

  it('positions active scene objects from pointer coordinates with safe bounds', () => {
    const campaign = createCampaignWithTokenObjectFixture()

    const updated = createCampaignWithPositionedActiveSceneObject(
      campaign,
      'object-token',
      { x: 176, y: 822 },
      '2026-07-07T09:30:00.000Z',
    )
    const object = getSceneCanvasState(getActiveCampaignScene(updated)!).objects.find(
      (candidate) => candidate.id === 'object-token',
    )

    expect(updated.updatedAt).toBe('2026-07-07T09:30:00.000Z')
    expect(object).toMatchObject({
      x: 210,
      y: 830,
    })
  })

  it('duplicates active scene objects and keeps token state isolated', () => {
    const campaign = createCampaignWithActiveSceneObjectTokenState(
      createCampaignWithTokenObjectFixture(),
      'object-token',
      {
        hitPoints: 18,
        armorClass: 14,
        note: 'ready',
      },
      '2026-07-07T09:00:00.000Z',
    )

    const updated = createCampaignWithDuplicatedActiveSceneObject(
      campaign,
      'object-token',
      '2026-07-07T10:00:00.000Z',
    )
    const objects = getSceneCanvasState(getActiveCampaignScene(updated)!).objects

    expect(objects).toHaveLength(2)
    expect(objects[1]).toMatchObject({
      name: 'Training token copy',
      text: 'Training token copy',
      x: 210,
      y: 210,
      tokenState: {
        hitPoints: 18,
        armorClass: 14,
        note: 'ready',
      },
    })
    expect(objects[1].id).not.toBe('object-token')
    expect(objects[1].tokenState).not.toBe(objects[0].tokenState)
  })

  it('updates object visibility and normalized token state', () => {
    const campaign = createCampaignWithTokenObjectFixture()
    const hidden = createCampaignWithActiveSceneObjectVisibility(
      campaign,
      'object-token',
      false,
      '2026-07-07T11:00:00.000Z',
    )
    const updated = createCampaignWithActiveSceneObjectTokenState(
      hidden,
      'object-token',
      {
        characterCardId: 'character-linked',
        hitPoints: 12.6,
        armorClass: -1,
        note: ' wounded ',
      },
      '2026-07-07T12:00:00.000Z',
    )
    const object = getSceneCanvasState(getActiveCampaignScene(updated)!).objects.find(
      (candidate) => candidate.id === 'object-token',
    )

    expect(object).toMatchObject({
      isPlayerVisible: false,
      tokenState: {
        characterCardId: 'character-linked',
        hitPoints: 13,
        armorClass: 0,
        note: 'wounded',
      },
    })
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

function createCampaignWithTokenObjectFixture(): Campaign {
  const campaign = createCampaignFixture()
  const activeScene = getActiveCampaignScene(campaign)

  if (!activeScene) {
    throw new Error('active-scene-not-found')
  }

  const tokenObject: SceneCanvasObject = {
    id: 'object-token',
    layerId: 'scene-layer-tokens',
    kind: 'token-placeholder',
    name: 'Training token',
    x: 140,
    y: 140,
    width: 70,
    height: 70,
    rotation: 0,
    color: '#2c806f',
    text: 'Training token',
    isPlayerVisible: true,
  }

  return {
    ...campaign,
    scenes: campaign.scenes.map((scene) =>
      scene.id === activeScene.id
        ? {
            ...scene,
            canvas: {
              ...getSceneCanvasState(scene),
              objects: [tokenObject],
            },
          }
        : scene,
    ),
  }
}
