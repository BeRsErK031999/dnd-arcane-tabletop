import { describe, expect, it } from 'vitest'
import type { Asset } from '@shared/types'
import { createEmptyCampaign } from './campaignFactory'
import {
  createAssetLibraryView,
  createCampaignWithAssetInActiveScene,
  createCampaignWithAssetPreview,
  createCampaignWithAssetTags,
  createCampaignWithImportedAsset,
} from './assetFactory'
import { createCampaignWithActiveScene, createCampaignWithNewScene } from './sceneFactory'

describe('assetFactory', () => {
  it('adds an imported map asset and binds it to the active scene', () => {
    const campaign = createCampaignWithNewScene(
      createEmptyCampaign({
        id: 'campaign-test',
        name: 'Campaign',
        timestamp: '2026-07-07T00:00:00.000Z',
      }),
      {
        id: 'scene-test',
        name: 'Scene',
      },
      '2026-07-07T01:00:00.000Z',
    )
    const asset = createAssetFixture({ kind: 'map' })

    const updated = createCampaignWithImportedAsset(campaign, asset, '2026-07-07T02:00:00.000Z')

    expect(updated.assets).toEqual([asset])
    expect(updated.scenes[0]).toMatchObject({
      id: 'scene-test',
      backgroundAssetId: 'asset-test',
    })
    expect(updated.updatedAt).toBe('2026-07-07T02:00:00.000Z')
  })

  it('builds player image preview state for an imported asset', () => {
    const campaign = createCampaignWithImportedAsset(
      createEmptyCampaign({
        id: 'campaign-test',
        name: 'Campaign',
        timestamp: '2026-07-07T00:00:00.000Z',
      }),
      createAssetFixture({ kind: 'handout' }),
      '2026-07-07T01:00:00.000Z',
    )

    const updated = createCampaignWithAssetPreview(campaign, 'asset-test', '2026-07-07T02:00:00.000Z')

    expect(updated.playerScreenState).toMatchObject({
      mode: 'image',
      isHidden: false,
      title: 'Импортированное изображение',
      campaignId: 'campaign-test',
      revealedAssetIds: ['asset-test'],
      handoutPreview: {
        id: 'asset-test',
        name: 'Импортированное изображение',
        kind: 'handout',
        sourceLabel: 'Handout',
      },
    })
  })

  it('filters assets by search, kind, and tags', () => {
    const assets = [
      createAssetFixture({ id: 'asset-map', kind: 'map', name: 'Moon Forest', tags: ['лес', 'ночь'] }),
      createAssetFixture({ id: 'asset-token', kind: 'token', name: 'Boss Token', tags: ['босс', 'лес'] }),
      createAssetFixture({ id: 'asset-handout', kind: 'handout', name: 'City Letter', tags: ['город'] }),
    ]

    const view = createAssetLibraryView(assets, {
      kind: 'token',
      searchQuery: 'boss',
      selectedTags: ['лес'],
    })

    expect(view.assets.map((asset) => asset.id)).toEqual(['asset-token'])
    expect(view.tags).toEqual([
      { name: 'босс', count: 1 },
      { name: 'город', count: 1 },
      { name: 'лес', count: 2 },
      { name: 'ночь', count: 1 },
    ])
  })

  it('updates asset tags in campaign JSON state', () => {
    const campaign = createCampaignWithImportedAsset(
      createEmptyCampaign({
        id: 'campaign-test',
        name: 'Campaign',
        timestamp: '2026-07-07T00:00:00.000Z',
      }),
      createAssetFixture({ kind: 'handout', tags: ['old'] }),
      '2026-07-07T01:00:00.000Z',
    )

    const updated = createCampaignWithAssetTags(campaign, 'asset-test', ' ночной зал, boss, boss ', '2026-07-07T02:00:00.000Z')

    expect(updated.assets[0].tags).toEqual(['ночной зал', 'boss'])
    expect(updated.updatedAt).toBe('2026-07-07T02:00:00.000Z')
  })

  it('uses an asset in the active scene', () => {
    const campaign = createCampaignWithNewScene(
      createEmptyCampaign({
        id: 'campaign-test',
        name: 'Campaign',
        timestamp: '2026-07-07T00:00:00.000Z',
      }),
      {
        id: 'scene-test',
        name: 'Scene',
      },
      '2026-07-07T01:00:00.000Z',
    )
    const withAsset = createCampaignWithImportedAsset(
      campaign,
      createAssetFixture({ id: 'asset-token', kind: 'token', name: 'Skeleton token' }),
      '2026-07-07T02:00:00.000Z',
    )

    const updated = createCampaignWithAssetInActiveScene(withAsset, 'asset-token', '2026-07-07T03:00:00.000Z')

    expect(updated.scenes[0].canvas.objects).toHaveLength(1)
    expect(updated.scenes[0].canvas.objects[0]).toMatchObject({
      assetId: 'asset-token',
      layerId: 'scene-layer-tokens',
      kind: 'token-placeholder',
      name: 'Skeleton token',
      isPlayerVisible: true,
    })
  })

  it('binds an existing map asset to the active scene', () => {
    const campaign = createCampaignWithNewScene(
      createEmptyCampaign({
        id: 'campaign-test',
        name: 'Campaign',
        timestamp: '2026-07-07T00:00:00.000Z',
      }),
      { id: 'scene-first', name: 'First' },
      '2026-07-07T01:00:00.000Z',
    )
    const withSecondScene = createCampaignWithNewScene(campaign, { id: 'scene-second', name: 'Second' })
    const activeSecond = createCampaignWithActiveScene(withSecondScene, 'scene-second')
    const withMap = createCampaignWithImportedAsset(
      activeSecond,
      createAssetFixture({ id: 'asset-map', kind: 'map', name: 'Second map' }),
      '2026-07-07T02:00:00.000Z',
    )

    const updated = createCampaignWithAssetInActiveScene(withMap, 'asset-map', '2026-07-07T03:00:00.000Z')

    expect(updated.scenes.map((scene) => [scene.id, scene.backgroundAssetId])).toEqual([
      ['scene-first', undefined],
      ['scene-second', 'asset-map'],
    ])
  })
})

function createAssetFixture(options: Partial<Pick<Asset, 'id' | 'kind' | 'name' | 'tags'>> & Pick<Asset, 'kind'>): Asset {
  return {
    id: options.id ?? 'asset-test',
    campaignId: 'campaign-test',
    kind: options.kind,
    name: options.name ?? 'Импортированное изображение',
    filePath: 'file:///tmp/imported-image.png',
    tags: options.tags ?? [],
    createdAt: '2026-07-07T00:00:00.000Z',
    metadata: {
      originalFileName: 'imported-image.png',
    },
  }
}
