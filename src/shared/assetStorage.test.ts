import { describe, expect, it } from 'vitest'
import type { Asset, Campaign } from './types/index.js'
import {
  deriveLegacyAssetStorageReference,
  isSha256Digest,
  migrateLegacyAssetStorageReference,
  migrateLegacyCampaignAssetReferences,
} from './assetStorage.js'

describe('asset storage compatibility', () => {
  it('derives lossless references for legacy file and embedded data assets', () => {
    const fileAsset = createAsset('file:///C:/campaigns/map.png')
    const dataAsset = createAsset('data:image/png;base64,AA==')

    expect(deriveLegacyAssetStorageReference(fileAsset)).toEqual({
      kind: 'legacy-file',
      fileUrl: fileAsset.filePath,
    })
    expect(deriveLegacyAssetStorageReference(dataAsset)).toEqual({
      kind: 'embedded-data',
    })

    const migratedFileAsset = migrateLegacyAssetStorageReference(fileAsset)
    expect(migratedFileAsset).not.toBe(fileAsset)
    expect(migratedFileAsset.filePath).toBe(fileAsset.filePath)
    expect(migratedFileAsset.storageRef).toEqual({ kind: 'legacy-file', fileUrl: fileAsset.filePath })
    expect(migratedFileAsset.exportPolicy).toBe('when-used')
  })

  it('preserves existing references and only clones campaigns that need migration', () => {
    const managedAsset: Asset = {
      ...createAsset('arcane-managed-asset:hash'),
      storageRef: {
        kind: 'managed',
        sha256: 'a'.repeat(64),
        fileName: 'map.png',
        mimeType: 'image/png',
        byteSize: 100,
      },
      exportPolicy: 'always',
    }
    const currentCampaign = createCampaign([managedAsset])
    const legacyCampaign = createCampaign([createAsset('data:image/png;base64,AA==')])

    expect(migrateLegacyAssetStorageReference(managedAsset)).toBe(managedAsset)
    expect(migrateLegacyCampaignAssetReferences(currentCampaign)).toBe(currentCampaign)

    const migratedCampaign = migrateLegacyCampaignAssetReferences(legacyCampaign)
    expect(migratedCampaign).not.toBe(legacyCampaign)
    expect(migratedCampaign.assets[0]?.storageRef?.kind).toBe('embedded-data')
    expect(legacyCampaign.assets[0]?.storageRef).toBeUndefined()
  })

  it('accepts only lowercase 64-character SHA-256 digests', () => {
    expect(isSha256Digest('0'.repeat(64))).toBe(true)
    expect(isSha256Digest('A'.repeat(64))).toBe(false)
    expect(isSha256Digest('0'.repeat(63))).toBe(false)
    expect(isSha256Digest(`${'0'.repeat(63)}g`)).toBe(false)
  })
})

function createAsset(filePath: string): Asset {
  return {
    id: 'asset-1',
    campaignId: 'campaign-1',
    kind: 'map',
    name: 'Map',
    filePath,
    tags: [],
    createdAt: '2026-07-15T00:00:00.000Z',
  }
}

function createCampaign(assets: Asset[]): Campaign {
  return {
    id: 'campaign-1',
    name: 'Campaign',
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    scenes: [],
    assets,
    characterCards: [],
    notes: [],
    combatState: {
      campaignId: 'campaign-1',
      isActive: false,
      round: 0,
      turnIndex: 0,
      participants: [],
    },
    playerScreenState: {
      mode: 'blank',
      isHidden: false,
      initiativeVisible: false,
      visibleTokenIds: [],
      revealedAssetIds: [],
      campaignId: 'campaign-1',
      updatedAt: '2026-07-15T00:00:00.000Z',
    },
  }
}
