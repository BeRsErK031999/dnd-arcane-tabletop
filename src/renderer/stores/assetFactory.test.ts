import { describe, expect, it } from 'vitest'
import type { Asset, AssetLibraryItem, ManageIndexedAssetForCampaignResult } from '@shared/types'
import { createEmptyCampaign } from './campaignFactory'
import {
  createAssetLibraryView,
  createCampaignWithAssetInActiveScene,
  createCampaignWithAssetPreview,
  createCampaignWithAssetTags,
  createCampaignWithImportedAsset,
  createCampaignWithIndexedAsset,
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

  it('selects an indexed asset for a campaign without leaking its absolute path into metadata', () => {
    const campaign = createEmptyCampaign({
      id: 'campaign-test',
      name: 'Campaign',
      timestamp: '2026-07-07T00:00:00.000Z',
    })
    const indexedAsset = createIndexedAssetFixture()

    const selected = createCampaignWithIndexedAsset(
      campaign,
      indexedAsset,
      createManagedSelection(indexedAsset),
      'map',
      'always',
      '2026-07-07T01:00:00.000Z',
    )

    expect(selected.assets).toHaveLength(1)
    expect(selected.assets[0]).toMatchObject({
      campaignId: 'campaign-test',
      kind: 'map',
      name: 'ritual-map',
      filePath: 'file:///managed-store/ritual-map.png',
      exportPolicy: 'always',
      tags: ['карта', 'ночь'],
      storageRef: {
        kind: 'managed',
        sha256: indexedAsset.sha256,
        indexedAssetId: indexedAsset.id,
      },
      metadata: {
        originalFileName: 'ritual-map.png',
        relativePath: 'maps/ritual-map.png',
        width: 1920,
        height: 1080,
      },
    })
    expect(selected.assets[0].metadata).not.toHaveProperty('canonicalPath')
    expect(selected.scenes).toEqual([])

    const updated = createCampaignWithIndexedAsset(
      selected,
      { ...indexedAsset, tags: ['обновлено'] },
      createManagedSelection(indexedAsset, selected.assets[0].id, true),
      'token',
      'when-used',
      '2026-07-07T02:00:00.000Z',
    )
    expect(updated.assets).toHaveLength(1)
    expect(updated.assets[0]).toMatchObject({
      id: selected.assets[0].id,
      kind: 'token',
      exportPolicy: 'when-used',
      tags: ['обновлено'],
    })
  })

  it('restores an unavailable indexed asset from an existing managed blob', () => {
    const campaign = createEmptyCampaign({ id: 'campaign-test', name: 'Campaign' })
    const indexedAsset = {
      ...createIndexedAssetFixture(),
      availability: 'missing' as const,
      fileUrl: undefined,
    }
    const restored = createCampaignWithIndexedAsset(
      campaign,
      indexedAsset,
      createManagedSelection(indexedAsset, 'asset-restored', true),
      'other',
      'when-used',
    )

    expect(restored.assets[0]).toMatchObject({
      id: 'asset-restored',
      filePath: 'file:///managed-store/ritual-map.png',
      storageRef: { kind: 'managed', sha256: indexedAsset.sha256 },
    })
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

function createIndexedAssetFixture(): AssetLibraryItem {
  return {
    id: 'indexed-ritual-map',
    sourceId: 'asset-source-test',
    canonicalPath: 'C:\\private\\art-library\\maps\\ritual-map.png',
    relativePath: 'maps/ritual-map.png',
    fileName: 'ritual-map.png',
    byteSize: 2_048_000,
    modifiedAt: '2026-07-07T00:00:00.000Z',
    kind: 'other',
    mimeType: 'image/png',
    format: 'png',
    width: 1920,
    height: 1080,
    sha256: 'a'.repeat(64),
    previewPath: 'C:\\private\\previews\\ritual-map.webp',
    tags: ['карта', 'ночь'],
    availability: 'available',
    indexedAt: '2026-07-07T00:00:00.000Z',
    fileUrl: 'file:///C:/private/art-library/maps/ritual-map.png',
    previewUrl: 'file:///C:/private/previews/ritual-map.webp',
  }
}

function createManagedSelection(
  indexedAsset: AssetLibraryItem,
  assetId = 'asset-managed-map',
  deduplicated = false,
): Extract<ManageIndexedAssetForCampaignResult, { ok: true }> {
  const sha256 = indexedAsset.sha256 ?? 'a'.repeat(64)
  return {
    ok: true,
    assetId,
    fileUrl: 'file:///managed-store/ritual-map.png',
    deduplicated,
    storageRef: {
      kind: 'managed',
      sha256,
      fileName: indexedAsset.fileName,
      mimeType: indexedAsset.mimeType,
      byteSize: indexedAsset.byteSize,
      indexedAssetId: indexedAsset.id,
    },
    blob: {
      sha256,
      relativePath: `objects/aa/aa/${sha256}.png`,
      byteSize: indexedAsset.byteSize,
      mimeType: indexedAsset.mimeType,
      fileExtension: '.png',
      createdAt: '2026-07-07T00:30:00.000Z',
      verifiedAt: '2026-07-07T00:30:00.000Z',
    },
  }
}
