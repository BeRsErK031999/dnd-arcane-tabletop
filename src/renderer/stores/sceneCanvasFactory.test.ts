import { describe, expect, it } from 'vitest'
import type { Asset, Scene } from '@shared/types'
import { createEmptyScene } from './sceneFactory'
import {
  createPlayerSceneCanvasProjection,
  getSceneCanvasLayerSummary,
  getSceneCanvasState,
} from './sceneCanvasFactory'

describe('sceneCanvasFactory', () => {
  it('creates canvas state defaults for a new scene', () => {
    const scene = createEmptyScene({
      campaignId: 'campaign-test',
      id: 'scene-test',
      name: 'Canvas scene',
    })

    expect(scene.canvas).toMatchObject({
      width: 1600,
      height: 900,
      viewport: {
        zoom: 1,
        panX: 0,
        panY: 0,
      },
      objects: [],
      measurements: [],
      fog: {
        enabled: false,
        opacity: 0.84,
        regions: [],
      },
    })
    expect(scene.canvas.layers.map((layer) => [layer.kind, layer.visibility])).toEqual([
      ['map', 'player-visible'],
      ['grid', 'player-visible'],
      ['object', 'player-visible'],
      ['token', 'player-visible'],
      ['master', 'master-only'],
      ['fog', 'disabled'],
    ])
  })

  it('projects only player-visible canvas layers, objects, and measurements', () => {
    const scene: Scene = {
      ...createEmptyScene({
        campaignId: 'campaign-test',
        id: 'scene-test',
        name: 'Canvas scene',
      }),
      backgroundAssetId: 'asset-map',
    }
    scene.canvas.objects = [
      {
        id: 'object-visible',
        layerId: 'scene-layer-objects',
        kind: 'marker',
        name: 'Visible marker',
        x: 240,
        y: 180,
        width: 120,
        height: 80,
        rotation: 0,
        color: '#2c806f',
        assetId: 'asset-map',
        tokenState: {
          characterCardId: 'character-master',
          hitPoints: 11,
          armorClass: 13,
          note: 'master-only',
        },
        isPlayerVisible: true,
      },
      {
        id: 'object-master',
        layerId: 'scene-layer-master',
        kind: 'note',
        name: 'Master note',
        x: 40,
        y: 40,
        width: 180,
        height: 80,
        rotation: 0,
        color: '#9f2d3c',
        isPlayerVisible: true,
      },
      {
        id: 'object-hidden',
        layerId: 'scene-layer-objects',
        kind: 'shape',
        name: 'Hidden shape',
        x: 400,
        y: 300,
        width: 100,
        height: 100,
        rotation: 0,
        color: '#d8a86a',
        isPlayerVisible: false,
      },
    ]
    scene.canvas.viewport = { zoom: 1.2, panX: 40, panY: -20 }
    scene.canvas.fog = {
      enabled: true,
      opacity: 0.72,
      regions: [
        {
          id: 'fog-secret-room',
          shape: 'rectangle',
          label: 'Secret room',
          x: 700,
          y: 320,
          width: 280,
          height: 210,
        },
      ],
    }
    scene.canvas.measurements = [
      {
        id: 'measurement-visible',
        kind: 'ruler',
        name: 'Visible distance',
        originX: 120,
        originY: 140,
        targetX: 540,
        targetY: 140,
        radius: 0,
        color: '#2c806f',
        label: '30 ft',
        isPlayerVisible: true,
      },
      {
        id: 'measurement-master',
        kind: 'area',
        shape: 'circle',
        name: 'Master area',
        originX: 320,
        originY: 260,
        targetX: 420,
        targetY: 260,
        radius: 100,
        color: '#9f2d3c',
        label: '20 ft',
        isPlayerVisible: false,
      },
    ]

    const projection = createPlayerSceneCanvasProjection(scene, [createAssetFixture()])

    expect(projection.backgroundAsset).toMatchObject({
      id: 'asset-map',
      filePath: 'file:///tmp/map.png',
    })
    expect(projection.viewport).toEqual({ zoom: 1.2, panX: 40, panY: -20 })
    expect(projection.layers.map((layer) => layer.kind)).toEqual(['map', 'grid', 'object', 'token', 'fog'])
    expect(projection.objects.map((object) => object.id)).toEqual(['object-visible'])
    expect(projection.objects[0].asset).toMatchObject({
      id: 'asset-map',
      filePath: 'file:///tmp/map.png',
    })
    expect(projection.objects[0]).not.toHaveProperty('tokenState')
    expect(projection.measurements.map((measurement) => measurement.id)).toEqual(['measurement-visible'])
    expect(projection.fog).toEqual({
      enabled: true,
      opacity: 0.72,
      regions: [
        {
          id: 'fog-secret-room',
          shape: 'rectangle',
          x: 700,
          y: 320,
          width: 280,
          height: 210,
        },
      ],
    })
    expect(projection.fog.regions[0]).not.toHaveProperty('label')
  })

  it('hydrates legacy scenes without canvas data', () => {
    const legacyScene = {
      id: 'scene-legacy',
      campaignId: 'campaign-test',
      name: 'Legacy',
      tokens: [],
      grid: {
        enabled: true,
        size: 70,
        color: '#8b7a5a',
        opacity: 0.35,
      },
      isActive: true,
    } as unknown as Scene

    const canvas = getSceneCanvasState(legacyScene)
    const summary = getSceneCanvasLayerSummary(legacyScene)

    expect(canvas.viewport).toEqual({
      zoom: 1,
      panX: 0,
      panY: 0,
    })
    expect(canvas.measurements).toEqual([])
    expect(canvas.fog).toEqual({
      enabled: false,
      opacity: 0.84,
      regions: [],
    })
    expect(canvas.layers).toHaveLength(6)
    expect(summary.find((layer) => layer.kind === 'master')).toMatchObject({
      visibility: 'master-only',
      objectCount: 0,
    })
  })
})

function createAssetFixture(): Asset {
  return {
    id: 'asset-map',
    campaignId: 'campaign-test',
    kind: 'map',
    name: 'Imported map',
    filePath: 'file:///tmp/map.png',
    tags: [],
    createdAt: '2026-07-07T00:00:00.000Z',
  }
}
