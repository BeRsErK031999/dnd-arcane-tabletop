import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  Asset,
  Campaign,
  ProjectExportAssetInclusion,
  ProjectTransferFailureReason,
} from '../../shared/types/index.js'

export const PROJECT_PACKAGE_FORMAT = 'dnd-arcane-tabletop-campaign'
export const PROJECT_PACKAGE_VERSION = 2
export const LEGACY_PROJECT_PACKAGE_VERSION = 1
export const PROJECT_MANIFEST_SCHEMA = 'arcane-campaign-manifest'
export const PORTABLE_ASSET_PREFIX = 'arcane-project-asset:'

export interface LegacyPortableAssetFile {
  assetId: string
  fileName: string
  sha256: string
  dataBase64: string
}

export interface PortableProjectPackageV1 {
  format: typeof PROJECT_PACKAGE_FORMAT
  version: typeof LEGACY_PROJECT_PACKAGE_VERSION
  exportedAt: string
  campaign: Campaign
  assets: LegacyPortableAssetFile[]
}

export interface ProjectPackageManifestAssetV2 {
  assetId: string
  fileName: string
  sha256: string
  byteSize: number
  mimeType: string
  relativePath: string
  inclusion: ProjectExportAssetInclusion
}

export interface ProjectPackageManifestBlobV2 {
  sha256: string
  fileName: string
  byteSize: number
  mimeType: string
  relativePath: string
}

export interface ProjectPackageManifestV2 {
  schema: typeof PROJECT_MANIFEST_SCHEMA
  version: typeof PROJECT_PACKAGE_VERSION
  campaignId: string
  campaignUpdatedAt: string
  assets: ProjectPackageManifestAssetV2[]
  blobs: ProjectPackageManifestBlobV2[]
}

export interface ProjectPackageBlobPayloadV2 {
  sha256: string
  relativePath: string
  dataBase64: string
}

export interface PortableProjectPackageV2 {
  format: typeof PROJECT_PACKAGE_FORMAT
  version: typeof PROJECT_PACKAGE_VERSION
  exportedAt: string
  manifest: ProjectPackageManifestV2
  campaign: Campaign
  blobs: ProjectPackageBlobPayloadV2[]
}

export type PortableProjectPackage = PortableProjectPackageV1 | PortableProjectPackageV2

export type ProjectPackageReadResult =
  | { ok: true; projectPackage: PortableProjectPackage }
  | { ok: false; reason: ProjectTransferFailureReason; damagedBlobCount?: number }

export async function readProjectPackage(sourceFilePath: string): Promise<ProjectPackageReadResult> {
  let parsed: unknown

  try {
    parsed = JSON.parse(await readFile(sourceFilePath, 'utf8')) as unknown
  } catch (error) {
    return { ok: false, reason: error instanceof SyntaxError ? 'invalid-package' : 'read-failed' }
  }

  if (!isRecord(parsed) || parsed.format !== PROJECT_PACKAGE_FORMAT) {
    return { ok: false, reason: 'invalid-package' }
  }
  if (parsed.version !== LEGACY_PROJECT_PACKAGE_VERSION && parsed.version !== PROJECT_PACKAGE_VERSION) {
    return { ok: false, reason: 'unsupported-version' }
  }

  return parsed.version === LEGACY_PROJECT_PACKAGE_VERSION
    ? validateLegacyPackage(parsed)
    : validateVersionTwoPackage(parsed)
}

export function createPortableAssetPath(assetId: string): string {
  return `${PORTABLE_ASSET_PREFIX}${encodeURIComponent(assetId)}`
}

export function readPortableAssetId(filePath: string): string | null {
  try {
    return decodeURIComponent(filePath.slice(PORTABLE_ASSET_PREFIX.length))
  } catch {
    return null
  }
}

export function createSha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function validateLegacyPackage(value: Record<string, unknown>): ProjectPackageReadResult {
  if (
    typeof value.exportedAt !== 'string' ||
    !isCampaign(value.campaign) ||
    !Array.isArray(value.assets)
  ) {
    return { ok: false, reason: 'invalid-package' }
  }

  const damagedBlobCount = value.assets.filter((asset) => !isLegacyPortableAssetFile(asset)).length
  if (damagedBlobCount > 0) {
    return { ok: false, reason: 'invalid-package', damagedBlobCount }
  }
  const portableAssets = value.assets as LegacyPortableAssetFile[]
  const assetIds = portableAssets.map((asset) => asset.assetId)
  if (new Set(assetIds).size !== assetIds.length) {
    return { ok: false, reason: 'invalid-package' }
  }

  const portableAssetIds = new Set(assetIds)
  const referencedPortableAssetIds = new Set<string>()
  for (const asset of value.campaign.assets) {
    if (asset.filePath.startsWith(PORTABLE_ASSET_PREFIX)) {
      const assetId = readPortableAssetId(asset.filePath)
      if (assetId === null || assetId !== asset.id || !portableAssetIds.has(assetId) || asset.storageRef !== undefined) {
        return { ok: false, reason: 'invalid-package' }
      }
      referencedPortableAssetIds.add(assetId)
      continue
    }
    if (!asset.filePath.startsWith('data:') || !hasSafeEmbeddedStorageReference(asset)) {
      return { ok: false, reason: 'invalid-package' }
    }
  }

  if (
    referencedPortableAssetIds.size !== portableAssetIds.size ||
    !hasSafePlayerProjectionAssetPaths(value.campaign, portableAssetIds)
  ) {
    return { ok: false, reason: 'invalid-package' }
  }

  return { ok: true, projectPackage: value as unknown as PortableProjectPackageV1 }
}

function validateVersionTwoPackage(value: Record<string, unknown>): ProjectPackageReadResult {
  if (
    typeof value.exportedAt !== 'string' ||
    !isCampaign(value.campaign) ||
    !isRecord(value.manifest) ||
    !Array.isArray(value.blobs)
  ) {
    return { ok: false, reason: 'invalid-package' }
  }
  const manifest = value.manifest
  if (
    manifest.schema !== PROJECT_MANIFEST_SCHEMA ||
    manifest.version !== PROJECT_PACKAGE_VERSION ||
    manifest.campaignId !== value.campaign.id ||
    manifest.campaignUpdatedAt !== value.campaign.updatedAt ||
    !Array.isArray(manifest.assets) ||
    !Array.isArray(manifest.blobs)
  ) {
    return { ok: false, reason: 'invalid-package' }
  }

  if (!manifest.assets.every(isManifestAsset) || !manifest.blobs.every(isManifestBlob)) {
    return { ok: false, reason: 'invalid-package' }
  }
  const payloadShapeFailures = value.blobs.filter((blob) => !isBlobPayloadShape(blob)).length
  if (payloadShapeFailures > 0) {
    return { ok: false, reason: 'invalid-package', damagedBlobCount: payloadShapeFailures }
  }

  const assets = manifest.assets as ProjectPackageManifestAssetV2[]
  const blobs = manifest.blobs as ProjectPackageManifestBlobV2[]
  const payloads = value.blobs as ProjectPackageBlobPayloadV2[]
  if (
    hasDuplicates(assets.map((asset) => asset.assetId)) ||
    hasDuplicates(blobs.map((blob) => blob.sha256)) ||
    hasDuplicates(blobs.map((blob) => blob.relativePath)) ||
    hasDuplicates(payloads.map((blob) => blob.sha256)) ||
    hasDuplicates(payloads.map((blob) => blob.relativePath))
  ) {
    return { ok: false, reason: 'invalid-package' }
  }

  const blobBySha256 = new Map(blobs.map((blob) => [blob.sha256, blob]))
  const payloadBySha256 = new Map(payloads.map((blob) => [blob.sha256, blob]))
  let damagedBlobCount = 0
  for (const blob of blobs) {
    const payload = payloadBySha256.get(blob.sha256)
    if (!payload || payload.relativePath !== blob.relativePath) {
      return { ok: false, reason: 'invalid-package' }
    }
    const contents = Buffer.from(payload.dataBase64, 'base64')
    if (contents.byteLength !== blob.byteSize || createSha256(contents) !== blob.sha256) {
      damagedBlobCount += 1
    }
  }
  if (damagedBlobCount > 0) {
    return { ok: false, reason: 'invalid-package', damagedBlobCount }
  }
  if (payloads.length !== blobs.length) {
    return { ok: false, reason: 'invalid-package' }
  }

  const manifestAssetById = new Map(assets.map((asset) => [asset.assetId, asset]))
  const portableAssetIds = new Set(assets.map((asset) => asset.assetId))
  for (const manifestAsset of assets) {
    const blob = blobBySha256.get(manifestAsset.sha256)
    if (
      !blob ||
      blob.relativePath !== manifestAsset.relativePath ||
      blob.byteSize !== manifestAsset.byteSize
    ) {
      return { ok: false, reason: 'invalid-package' }
    }
  }

  for (const asset of value.campaign.assets) {
    if (asset.filePath.startsWith(PORTABLE_ASSET_PREFIX)) {
      const assetId = readPortableAssetId(asset.filePath)
      const manifestAsset = manifestAssetById.get(asset.id)
      if (
        assetId !== asset.id ||
        !manifestAsset ||
        asset.storageRef?.kind !== 'managed' ||
        asset.storageRef.sha256 !== manifestAsset.sha256 ||
        asset.storageRef.fileName !== manifestAsset.fileName ||
        asset.storageRef.mimeType !== manifestAsset.mimeType ||
        asset.storageRef.byteSize !== manifestAsset.byteSize
      ) {
        return { ok: false, reason: 'invalid-package' }
      }
      continue
    }
    if (!asset.filePath.startsWith('data:') || !hasSafeEmbeddedStorageReference(asset)) {
      return { ok: false, reason: 'invalid-package' }
    }
  }

  if (
    value.campaign.assets.filter((asset) => asset.filePath.startsWith(PORTABLE_ASSET_PREFIX)).length !== assets.length ||
    !hasSafePlayerProjectionAssetPaths(value.campaign, portableAssetIds)
  ) {
    return { ok: false, reason: 'invalid-package' }
  }

  return { ok: true, projectPackage: value as unknown as PortableProjectPackageV2 }
}

function isLegacyPortableAssetFile(value: unknown): value is LegacyPortableAssetFile {
  if (
    !isRecord(value) ||
    typeof value.assetId !== 'string' ||
    value.assetId.length === 0 ||
    typeof value.fileName !== 'string' ||
    !isSafeFileName(value.fileName) ||
    !isSha256(value.sha256) ||
    typeof value.dataBase64 !== 'string' ||
    !isValidBase64(value.dataBase64)
  ) {
    return false
  }
  return createSha256(Buffer.from(value.dataBase64, 'base64')) === value.sha256
}

function isManifestAsset(value: unknown): value is ProjectPackageManifestAssetV2 {
  return (
    isRecord(value) &&
    typeof value.assetId === 'string' &&
    value.assetId.length > 0 &&
    typeof value.fileName === 'string' &&
    isSafeFileName(value.fileName) &&
    isSha256(value.sha256) &&
    isNonNegativeSafeInteger(value.byteSize) &&
    typeof value.mimeType === 'string' &&
    value.mimeType.length > 0 &&
    typeof value.relativePath === 'string' &&
    isSafeBlobRelativePath(value.relativePath) &&
    (value.inclusion === 'used' || value.inclusion === 'always')
  )
}

function isManifestBlob(value: unknown): value is ProjectPackageManifestBlobV2 {
  return (
    isRecord(value) &&
    isSha256(value.sha256) &&
    typeof value.fileName === 'string' &&
    isSafeFileName(value.fileName) &&
    isNonNegativeSafeInteger(value.byteSize) &&
    typeof value.mimeType === 'string' &&
    value.mimeType.length > 0 &&
    typeof value.relativePath === 'string' &&
    isSafeBlobRelativePath(value.relativePath)
  )
}

function isBlobPayloadShape(value: unknown): value is ProjectPackageBlobPayloadV2 {
  return (
    isRecord(value) &&
    isSha256(value.sha256) &&
    typeof value.relativePath === 'string' &&
    isSafeBlobRelativePath(value.relativePath) &&
    typeof value.dataBase64 === 'string' &&
    isValidBase64(value.dataBase64)
  )
}

function isCampaign(value: unknown): value is Campaign {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    Array.isArray(value.scenes) &&
    value.scenes.every(isCampaignOwnedEntity) &&
    Array.isArray(value.assets) &&
    value.assets.every(isAsset) &&
    Array.isArray(value.characterCards) &&
    value.characterCards.every(isCampaignOwnedEntity) &&
    Array.isArray(value.notes) &&
    value.notes.every(isCampaignOwnedEntity) &&
    isCampaignOwnedEntity(value.combatState) &&
    isPlayerScreenStateForTransfer(value.playerScreenState)
  )
}

function isAsset(value: unknown): value is Asset {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.campaignId === 'string' &&
    typeof value.kind === 'string' &&
    typeof value.name === 'string' &&
    typeof value.filePath === 'string' &&
    (value.storageRef === undefined || isCampaignAssetStorageReference(value.storageRef)) &&
    (value.exportPolicy === undefined || value.exportPolicy === 'when-used' || value.exportPolicy === 'always') &&
    Array.isArray(value.tags) &&
    typeof value.createdAt === 'string'
  )
}

function isCampaignAssetStorageReference(value: unknown): value is Asset['storageRef'] {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return false
  }
  switch (value.kind) {
    case 'embedded-data':
      return value.dataUrl === undefined || typeof value.dataUrl === 'string'
    case 'legacy-file':
      return (
        typeof value.fileUrl === 'string' &&
        (value.sha256 === undefined || isSha256(value.sha256)) &&
        (value.indexedAssetId === undefined || typeof value.indexedAssetId === 'string')
      )
    case 'managed':
      return (
        isSha256(value.sha256) &&
        typeof value.fileName === 'string' &&
        typeof value.mimeType === 'string' &&
        isNonNegativeSafeInteger(value.byteSize) &&
        (value.indexedAssetId === undefined || typeof value.indexedAssetId === 'string')
      )
    default:
      return false
  }
}

function hasSafeEmbeddedStorageReference(asset: Asset): boolean {
  return (
    asset.storageRef === undefined ||
    (asset.storageRef.kind === 'embedded-data' &&
      (asset.storageRef.dataUrl === undefined || asset.storageRef.dataUrl === asset.filePath))
  )
}

function isCampaignOwnedEntity(value: unknown): value is { campaignId: string } {
  return isRecord(value) && typeof value.campaignId === 'string'
}

function isPlayerScreenStateForTransfer(value: unknown): value is Campaign['playerScreenState'] {
  if (
    !isRecord(value) ||
    typeof value.mode !== 'string' ||
    typeof value.isHidden !== 'boolean' ||
    typeof value.initiativeVisible !== 'boolean' ||
    !Array.isArray(value.visibleTokenIds) ||
    !Array.isArray(value.revealedAssetIds) ||
    typeof value.updatedAt !== 'string' ||
    (value.campaignId !== undefined && typeof value.campaignId !== 'string')
  ) {
    return false
  }
  if (value.sceneCanvas === undefined) {
    return true
  }
  return (
    isRecord(value.sceneCanvas) &&
    Array.isArray(value.sceneCanvas.objects) &&
    value.sceneCanvas.objects.every(
      (object) => isRecord(object) && (object.asset === undefined || isPlayerSceneCanvasAsset(object.asset)),
    ) &&
    (value.sceneCanvas.backgroundAsset === undefined || isPlayerSceneCanvasAsset(value.sceneCanvas.backgroundAsset))
  )
}

function isPlayerSceneCanvasAsset(value: unknown): value is { id: string; name: string; filePath: string } {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.filePath === 'string'
  )
}

function hasSafePlayerProjectionAssetPaths(campaign: Campaign, portableAssetIds: ReadonlySet<string>): boolean {
  const sceneCanvas = campaign.playerScreenState.sceneCanvas
  if (!sceneCanvas) {
    return true
  }
  const projectedAssets = [
    sceneCanvas.backgroundAsset,
    ...sceneCanvas.objects.map((object) => object.asset),
  ].filter((asset): asset is NonNullable<typeof asset> => asset !== undefined)

  return projectedAssets.every((asset) => {
    if (asset.filePath.startsWith('data:')) {
      return true
    }
    if (!asset.filePath.startsWith(PORTABLE_ASSET_PREFIX)) {
      return false
    }
    const assetId = readPortableAssetId(asset.filePath)
    return assetId === asset.id && portableAssetIds.has(assetId)
  })
}

function isSafeFileName(fileName: string): boolean {
  return (
    fileName.length > 0 &&
    fileName.length <= 255 &&
    path.basename(fileName) === fileName &&
    !fileName.includes('/') &&
    !fileName.includes('\\')
  )
}

function isSafeBlobRelativePath(value: string): boolean {
  return (
    value.startsWith('blobs/') &&
    !value.includes('\\') &&
    !path.posix.isAbsolute(value) &&
    path.posix.normalize(value) === value &&
    !value.split('/').includes('..')
  )
}

function isValidBase64(value: string): boolean {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
