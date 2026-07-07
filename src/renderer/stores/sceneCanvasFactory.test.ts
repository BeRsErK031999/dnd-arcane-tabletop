import { describe, expect, it } from 'vitest'
import type { Asset, Scene } from '@shared/types'
import { createEmptyScene } from './sceneFactory'
import {
  createPlayerSceneCanvasProjection,
  getSceneCanvasLayerSummary,
  getSceneCanvasState,
} from './sceneCanvasFactory'

describe('sceneCanvasFactory', () => {
  it('creates stage 6 canvas layers for a new scene', () => {
    const scene = createEmptyScene({
      campaignId: 'campaign-test',
      id: 'scene-test',
      name: 'Canvas scene',
    })

    expect(scene.canvas).toMatchObject({
      width: 1600,
      height: 900,
      objects: [],
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

  it('projects only player-visible canvas layers and objects', () => {
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

    const projection = createPlayerSceneCanvasProjection(scene, [createAssetFixture()])

    expect(projection.backgroundAsset).toMatchObject({
      id: 'asset-map',
      filePath: 'file:///tmp/map.png',
    })
    expect(projection.layers.map((layer) => layer.kind)).toEqual(['map', 'grid', 'object', 'token'])
    expect(projection.objects.map((object) => object.id)).toEqual(['object-visible'])
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
    createdAt: '2026-07-07T00:00:00.000Z',
  }
}
