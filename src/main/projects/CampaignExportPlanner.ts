import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  Asset,
  Campaign,
  ProjectExportAssetInclusion,
  ProjectExportAssetPreview,
  ProjectExportPreview,
  ProjectTransferFailureReason,
} from '../../shared/types/index.js'
import type { ManagedAssetStore } from '../assets/hybridStorageContracts.js'

export interface CampaignExportBlobPlan {
  sha256: string
  relativePath: string
  fileName: string
  mimeType: string
  byteSize: number
  sourceFilePath: string
}

export interface CampaignExportAssetPlan {
  asset: Asset
  preview: ProjectExportAssetPreview
  blob?: CampaignExportBlobPlan
}

export interface CampaignExportPlan {
  preview: ProjectExportPreview
  assets: CampaignExportAssetPlan[]
  blobs: CampaignExportBlobPlan[]
}

export class CampaignExportPlanError extends Error {
  constructor(readonly reason: ProjectTransferFailureReason) {
    super(reason)
    this.name = 'CampaignExportPlanError'
  }
}

export class CampaignExportPlanner {
  constructor(
    private readonly managedAssetStore: ManagedAssetStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createPlan(campaign: Campaign): Promise<CampaignExportPlan> {
    const usedAssetIds = collectUsedAssetIds(campaign)
    const assets: CampaignExportAssetPlan[] = []
    const blobsBySha256 = new Map<string, CampaignExportBlobPlan>()

    for (const asset of campaign.assets) {
      const inclusion = getAssetInclusion(asset, usedAssetIds)
      if (!inclusion) {
        continue
      }

      const assetPlan = asset.filePath.startsWith('data:')
        ? createEmbeddedAssetPlan(asset, inclusion)
        : await this.createFileBackedAssetPlan(asset, inclusion)
      assets.push(assetPlan)

      if (assetPlan.blob && !blobsBySha256.has(assetPlan.blob.sha256)) {
        blobsBySha256.set(assetPlan.blob.sha256, assetPlan.blob)
      }
    }

    const blobs = [...blobsBySha256.values()]
    const previewAssets = assets.map((asset) => asset.preview)
    const preview: ProjectExportPreview = {
      token: randomUUID(),
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignUpdatedAt: campaign.updatedAt,
      generatedAt: this.now().toISOString(),
      assets: previewAssets,
      usedAssetCount: previewAssets.filter((asset) => asset.inclusion === 'used').length,
      additionalAssetCount: previewAssets.filter((asset) => asset.inclusion === 'always').length,
      embeddedAssetCount: previewAssets.filter((asset) => asset.storage === 'embedded-data').length,
      uniqueBlobCount: blobs.length,
      totalByteSize:
        blobs.reduce((total, blob) => total + blob.byteSize, 0) +
        previewAssets
          .filter((asset) => asset.storage === 'embedded-data')
          .reduce((total, asset) => total + asset.byteSize, 0),
    }

    return { preview, assets, blobs }
  }

  async readVerifiedBlob(blob: CampaignExportBlobPlan): Promise<Buffer> {
    try {
      const contents = await readFile(blob.sourceFilePath)
      if (contents.byteLength !== blob.byteSize || createSha256(contents) !== blob.sha256) {
        throw new CampaignExportPlanError('preview-outdated')
      }
      return contents
    } catch (error) {
      if (error instanceof CampaignExportPlanError) {
        throw error
      }
      throw new CampaignExportPlanError('asset-read-failed')
    }
  }

  private async createFileBackedAssetPlan(
    asset: Asset,
    inclusion: ProjectExportAssetInclusion,
  ): Promise<CampaignExportAssetPlan> {
    if (asset.storageRef?.kind === 'embedded-data') {
      throw new CampaignExportPlanError('unsupported-asset-path')
    }

    if (asset.storageRef?.kind === 'managed') {
      const blob = await this.managedAssetStore.get(asset.storageRef.sha256)
      if (!blob || !(await this.managedAssetStore.verify(blob.sha256))) {
        throw new CampaignExportPlanError('asset-read-failed')
      }
      const fileUrl = await this.managedAssetStore.resolveFileUrl(blob.sha256)
      if (!fileUrl) {
        throw new CampaignExportPlanError('asset-read-failed')
      }

      const blobPlan: CampaignExportBlobPlan = {
        sha256: blob.sha256,
        relativePath: createPackageBlobPath(blob.sha256, blob.fileExtension),
        fileName: asset.storageRef.fileName,
        mimeType: asset.storageRef.mimeType || blob.mimeType,
        byteSize: blob.byteSize,
        sourceFilePath: fileURLToPath(fileUrl),
      }
      return {
        asset,
        blob: blobPlan,
        preview: createAssetPreview(asset, inclusion, 'managed', blobPlan),
      }
    }

    const fileUrl = asset.storageRef?.kind === 'legacy-file' ? asset.storageRef.fileUrl : asset.filePath
    if (!fileUrl.startsWith('file:')) {
      throw new CampaignExportPlanError('unsupported-asset-path')
    }

    try {
      const sourceFilePath = fileURLToPath(fileUrl)
      const fileStat = await stat(sourceFilePath)
      if (!fileStat.isFile()) {
        throw new Error('Asset source is not a file')
      }
      const sha256 = await hashFile(sourceFilePath)
      if (asset.storageRef?.kind === 'legacy-file' && asset.storageRef.sha256 && asset.storageRef.sha256 !== sha256) {
        throw new CampaignExportPlanError('preview-outdated')
      }
      const fileName = path.basename(sourceFilePath)
      const mimeType = inferMimeType(fileName)
      const blobPlan: CampaignExportBlobPlan = {
        sha256,
        relativePath: createPackageBlobPath(sha256, path.extname(fileName)),
        fileName,
        mimeType,
        byteSize: fileStat.size,
        sourceFilePath,
      }
      return {
        asset,
        blob: blobPlan,
        preview: createAssetPreview(asset, inclusion, 'legacy-file', blobPlan),
      }
    } catch (error) {
      if (error instanceof CampaignExportPlanError) {
        throw error
      }
      throw new CampaignExportPlanError('asset-read-failed')
    }
  }
}

function collectUsedAssetIds(campaign: Campaign): Set<string> {
  const assetIds = new Set<string>()
  const add = (assetId: string | undefined): void => {
    if (assetId) {
      assetIds.add(assetId)
    }
  }

  for (const scene of campaign.scenes) {
    add(scene.backgroundAssetId)
    for (const object of scene.canvas.objects) {
      add(object.assetId)
    }
    for (const token of scene.tokens) {
      add(token.imageAssetId)
    }
  }
  for (const card of campaign.characterCards) {
    add(card.portraitAssetId)
  }
  for (const assetId of campaign.playerScreenState.revealedAssetIds) {
    add(assetId)
  }
  add(campaign.playerScreenState.handoutPreview?.id)
  add(campaign.playerScreenState.sceneCanvas?.backgroundAsset?.id)
  for (const object of campaign.playerScreenState.sceneCanvas?.objects ?? []) {
    add(object.assetId)
    add(object.asset?.id)
  }

  return assetIds
}

function getAssetInclusion(
  asset: Asset,
  usedAssetIds: ReadonlySet<string>,
): ProjectExportAssetInclusion | null {
  if (usedAssetIds.has(asset.id)) {
    return 'used'
  }
  return asset.exportPolicy === 'always' ? 'always' : null
}

function createEmbeddedAssetPlan(
  asset: Asset,
  inclusion: ProjectExportAssetInclusion,
): CampaignExportAssetPlan {
  const parsed = parseDataUrl(asset.filePath)
  if (!parsed) {
    throw new CampaignExportPlanError('unsupported-asset-path')
  }
  return {
    asset,
    preview: {
      assetId: asset.id,
      name: asset.name,
      kind: asset.kind,
      inclusion,
      storage: 'embedded-data',
      byteSize: parsed.contents.byteLength,
      sha256: createSha256(parsed.contents),
      mimeType: parsed.mimeType,
    },
  }
}

function createAssetPreview(
  asset: Asset,
  inclusion: ProjectExportAssetInclusion,
  storage: 'managed' | 'legacy-file',
  blob: CampaignExportBlobPlan,
): ProjectExportAssetPreview {
  return {
    assetId: asset.id,
    name: asset.name,
    kind: asset.kind,
    inclusion,
    storage,
    byteSize: blob.byteSize,
    sha256: blob.sha256,
    mimeType: blob.mimeType,
  }
}

function createPackageBlobPath(sha256: string, extension: string): string {
  const normalizedExtension = normalizeFileExtension(extension)
  return path.posix.join('blobs', sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}${normalizedExtension}`)
}

function normalizeFileExtension(extension: string): string {
  const normalized = extension.trim().toLowerCase()
  const withDot = normalized.startsWith('.') ? normalized : `.${normalized}`
  return /^\.[a-z0-9]{1,10}$/.test(withDot) ? withDot : '.bin'
}

function inferMimeType(fileName: string): string {
  const mimeTypes: Readonly<Record<string, string>> = {
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.jfif': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }
  return mimeTypes[path.extname(fileName).toLowerCase()] ?? 'application/octet-stream'
}

function parseDataUrl(value: string): { mimeType: string; contents: Buffer } | null {
  const commaIndex = value.indexOf(',')
  if (!value.startsWith('data:') || commaIndex < 5) {
    return null
  }
  const metadata = value.slice(5, commaIndex)
  const encodedContents = value.slice(commaIndex + 1)
  const mimeType = metadata.split(';')[0] || 'text/plain'

  try {
    if (metadata.split(';').includes('base64')) {
      if (encodedContents.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encodedContents)) {
        return null
      }
      return { mimeType, contents: Buffer.from(encodedContents, 'base64') }
    }
    return { mimeType, contents: Buffer.from(decodeURIComponent(encodedContents), 'utf8') }
  } catch {
    return null
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

function createSha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
