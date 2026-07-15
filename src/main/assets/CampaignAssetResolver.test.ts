import { describe, expect, it } from 'vitest'
import type { Asset, ManagedAssetBlob, Sha256Digest } from '../../shared/types/index.js'
import type { ManagedAssetStore, PutManagedAssetInput } from './hybridStorageContracts.js'
import { createManagedAssetRelativePath, DefaultCampaignAssetResolver } from './CampaignAssetResolver.js'

describe('DefaultCampaignAssetResolver', () => {
  it('resolves legacy and embedded assets without a managed blob lookup', async () => {
    const managedStore = new FakeManagedAssetStore()
    const resolver = new DefaultCampaignAssetResolver(managedStore)

    await expect(resolver.resolve(createAsset('file:///C:/campaign/map.png'))).resolves.toEqual({
      ok: true,
      fileUrl: 'file:///C:/campaign/map.png',
      origin: 'legacy-file',
    })
    await expect(resolver.resolve(createAsset('data:image/png;base64,AA=='))).resolves.toEqual({
      ok: true,
      fileUrl: 'data:image/png;base64,AA==',
      origin: 'embedded-data',
    })
    expect(managedStore.resolveRequests).toEqual([])
  })

  it('resolves managed assets by SHA-256 and reports missing blobs', async () => {
    const sha256 = 'a'.repeat(64)
    const managedStore = new FakeManagedAssetStore(new Map([[sha256, 'file:///managed/objects/aa/map.png']]))
    const resolver = new DefaultCampaignAssetResolver(managedStore)
    const managedAsset: Asset = {
      ...createAsset('arcane-managed-asset:a'),
      storageRef: {
        kind: 'managed',
        sha256,
        fileName: 'map.png',
        mimeType: 'image/png',
        byteSize: 100,
      },
    }

    await expect(resolver.resolve(managedAsset)).resolves.toEqual({
      ok: true,
      fileUrl: 'file:///managed/objects/aa/map.png',
      origin: 'managed',
      sha256,
    })

    const missingAsset: Asset = {
      ...managedAsset,
      storageRef: {
        kind: 'managed',
        sha256: 'b'.repeat(64),
        fileName: 'map.png',
        mimeType: 'image/png',
        byteSize: 100,
      },
    }
    await expect(resolver.resolve(missingAsset)).resolves.toEqual({
      ok: false,
      reason: 'managed-blob-not-found',
    })
  })

  it('builds deterministic content-addressed relative paths', () => {
    const sha256 = '0123456789abcdef'.repeat(4)

    expect(createManagedAssetRelativePath(sha256, '.PNG')).toBe(
      `objects/01/23/${sha256}.png`,
    )
    expect(createManagedAssetRelativePath(sha256, 'unsafe extension')).toBe(
      `objects/01/23/${sha256}.bin`,
    )
    expect(() => createManagedAssetRelativePath('invalid', '.png')).toThrow('Invalid SHA-256 digest')
  })
})

class FakeManagedAssetStore implements ManagedAssetStore {
  readonly resolveRequests: Sha256Digest[] = []

  constructor(private readonly fileUrls = new Map<Sha256Digest, string>()) {}

  async initialize(): Promise<void> {}

  async put(_input: PutManagedAssetInput): Promise<ManagedAssetBlob> {
    throw new Error('Not implemented in resolver test')
  }

  async get(_sha256: Sha256Digest): Promise<ManagedAssetBlob | null> {
    return null
  }

  async resolveFileUrl(sha256: Sha256Digest): Promise<string | null> {
    this.resolveRequests.push(sha256)
    return this.fileUrls.get(sha256) ?? null
  }

  async verify(_sha256: Sha256Digest): Promise<boolean> {
    return false
  }

  async deleteIfUnreferenced(_sha256: Sha256Digest): Promise<ManagedAssetBlob | null> {
    return null
  }
}

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
