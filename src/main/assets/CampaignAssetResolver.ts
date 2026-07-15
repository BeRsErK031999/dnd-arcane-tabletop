import path from 'node:path'
import type { Asset, CampaignAssetStorageReference, Sha256Digest } from '../../shared/types/index.js'
import { deriveLegacyAssetStorageReference, isSha256Digest } from '../../shared/assetStorage.js'
import type {
  CampaignAssetResolution,
  CampaignAssetResolver,
  ManagedAssetStore,
} from './hybridStorageContracts.js'

export class DefaultCampaignAssetResolver implements CampaignAssetResolver {
  constructor(private readonly managedAssetStore: ManagedAssetStore) {}

  async resolve(asset: Asset): Promise<CampaignAssetResolution> {
    const storageRef = asset.storageRef ?? deriveLegacyAssetStorageReference(asset)

    if (storageRef === null) {
      return { ok: false, reason: 'unsupported-reference' }
    }

    return this.resolveStorageReference(storageRef, asset.filePath)
  }

  private async resolveStorageReference(
    storageRef: CampaignAssetStorageReference,
    fallbackFilePath: string,
  ): Promise<CampaignAssetResolution> {
    switch (storageRef.kind) {
      case 'embedded-data': {
        const dataUrl = storageRef.dataUrl ?? fallbackFilePath
        return dataUrl.startsWith('data:')
          ? { ok: true, fileUrl: dataUrl, origin: storageRef.kind }
          : { ok: false, reason: 'invalid-reference' }
      }
      case 'legacy-file':
        return storageRef.fileUrl.startsWith('file:') &&
          (storageRef.sha256 === undefined || isSha256Digest(storageRef.sha256))
          ? {
              ok: true,
              fileUrl: storageRef.fileUrl,
              origin: storageRef.kind,
              ...(storageRef.sha256 ? { sha256: storageRef.sha256 } : {}),
            }
          : { ok: false, reason: 'invalid-reference' }
      case 'managed':
        return this.resolveManagedAsset(storageRef.sha256)
    }
  }

  private async resolveManagedAsset(sha256: Sha256Digest): Promise<CampaignAssetResolution> {
    if (!isSha256Digest(sha256)) {
      return { ok: false, reason: 'invalid-reference' }
    }

    const fileUrl = await this.managedAssetStore.resolveFileUrl(sha256)

    return fileUrl === null
      ? { ok: false, reason: 'managed-blob-not-found' }
      : { ok: true, fileUrl, origin: 'managed', sha256 }
  }
}

export function createManagedAssetRelativePath(sha256: Sha256Digest, fileExtension: string): string {
  if (!isSha256Digest(sha256)) {
    throw new Error('Invalid SHA-256 digest')
  }

  const normalizedExtension = normalizeFileExtension(fileExtension)
  return path.posix.join('objects', sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}${normalizedExtension}`)
}

function normalizeFileExtension(fileExtension: string): string {
  const normalized = fileExtension.trim().toLowerCase()
  const withDot = normalized.startsWith('.') ? normalized : `.${normalized}`
  return /^\.[a-z0-9]{1,10}$/.test(withDot) ? withDot : '.bin'
}
