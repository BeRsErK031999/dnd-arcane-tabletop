import { describe, expect, it } from 'vitest'
import type { Asset } from '@shared/types'
import { createEmptyCampaign } from './campaignFactory'
import { createCampaignWithImportedAsset, createCampaignWithAssetPreview } from './assetFactory'
import { createCampaignWithNewScene } from './sceneFactory'

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
})

function createAssetFixture(options: Pick<Asset, 'kind'>): Asset {
  return {
    id: 'asset-test',
    campaignId: 'campaign-test',
    kind: options.kind,
    name: 'Импортированное изображение',
    filePath: 'file:///tmp/imported-image.png',
    createdAt: '2026-07-07T00:00:00.000Z',
    metadata: {
      originalFileName: 'imported-image.png',
    },
  }
}
