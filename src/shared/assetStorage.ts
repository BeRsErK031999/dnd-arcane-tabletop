import type {
  Asset,
  Campaign,
  CampaignAssetStorageReference,
  Sha256Digest,
} from './types/index.js'

const SHA256_PATTERN = /^[a-f0-9]{64}$/

export function isSha256Digest(value: string): value is Sha256Digest {
  return SHA256_PATTERN.test(value)
}

export function deriveLegacyAssetStorageReference(asset: Asset): CampaignAssetStorageReference | null {
  if (asset.filePath.startsWith('data:')) {
    return {
      kind: 'embedded-data',
    }
  }

  if (asset.filePath.startsWith('file:')) {
    return {
      kind: 'legacy-file',
      fileUrl: asset.filePath,
    }
  }

  return null
}

export function migrateLegacyAssetStorageReference(asset: Asset): Asset {
  if (asset.storageRef !== undefined) {
    return asset.exportPolicy === undefined ? { ...asset, exportPolicy: 'when-used' } : asset
  }

  const storageRef = deriveLegacyAssetStorageReference(asset)

  return storageRef === null
    ? asset
    : {
        ...asset,
        storageRef,
        exportPolicy: asset.exportPolicy ?? 'when-used',
      }
}

export function migrateLegacyCampaignAssetReferences(campaign: Campaign): Campaign {
  let didChange = false
  const assets = campaign.assets.map((asset) => {
    const migratedAsset = migrateLegacyAssetStorageReference(asset)
    didChange ||= migratedAsset !== asset
    return migratedAsset
  })

  return didChange ? { ...campaign, assets } : campaign
}
