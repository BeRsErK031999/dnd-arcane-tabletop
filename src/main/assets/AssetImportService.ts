import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import type { AssetId, ImportImageAssetRequest, ImportImageAssetResult } from '../../shared/types/index.js'
import type { ManagedAssetRegistry, ManagedAssetStore } from './hybridStorageContracts.js'

export type ImageFilePicker = () => Promise<string | null>

const supportedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.jfif'])
const imageMimeTypes: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.webp': 'image/webp',
}

export class AssetImportService {
  constructor(
    private readonly managedAssetStore: ManagedAssetStore,
    private readonly pickImageFile: ImageFilePicker,
    private readonly managedAssetRegistry?: ManagedAssetRegistry,
  ) {}

  async importImageAsset(request: ImportImageAssetRequest): Promise<ImportImageAssetResult> {
    const sourceFilePath = request.sourceFilePath ?? (await this.pickImageFile())

    if (!sourceFilePath) {
      return { ok: false, reason: 'cancelled' }
    }

    const extension = path.extname(sourceFilePath).toLowerCase()

    if (!supportedImageExtensions.has(extension)) {
      return { ok: false, reason: 'unsupported-file' }
    }

    try {
      const timestamp = new Date().toISOString()
      const assetId = createAssetId()
      const originalFileName = path.basename(sourceFilePath)
      const sourceStat = await stat(sourceFilePath)
      const sha256 = await hashFile(sourceFilePath)
      const mimeType = imageMimeTypes[extension] ?? 'application/octet-stream'
      const blob = await this.managedAssetStore.put({
        sourceFilePath: path.resolve(sourceFilePath),
        sha256,
        byteSize: sourceStat.size,
        mimeType,
        fileExtension: extension,
      })
      const fileUrl = await this.managedAssetStore.resolveFileUrl(blob.sha256)
      if (!fileUrl) {
        return { ok: false, reason: 'copy-failed' }
      }
      const storageRef = {
        kind: 'managed' as const,
        sha256: blob.sha256,
        fileName: originalFileName,
        mimeType,
        byteSize: blob.byteSize,
      }
      await this.managedAssetRegistry?.saveCampaignAssetBinding({
        campaignId: request.campaignId,
        assetId,
        storage: storageRef,
        exportPolicy: 'when-used',
        createdAt: timestamp,
        updatedAt: timestamp,
      })

      return {
        ok: true,
        asset: {
          id: assetId,
          campaignId: request.campaignId,
          kind: request.kind,
          name: normalizeAssetName(request.suggestedName ?? path.parse(originalFileName).name),
          filePath: fileUrl,
          storageRef,
          exportPolicy: 'when-used',
          tags: normalizeAssetTags(request.tags),
          createdAt: timestamp,
          metadata: {
            originalFileName,
            fileExtension: extension.slice(1),
          },
        },
      }
    } catch {
      return { ok: false, reason: 'copy-failed' }
    }
  }
}

function createAssetId(): AssetId {
  const randomId = globalThis.crypto?.randomUUID?.()

  if (randomId) {
    return `asset-${randomId}`
  }

  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeAssetName(name: string): string {
  const trimmedName = name.trim()
  return trimmedName === '' ? 'Новое изображение' : trimmedName
}

function normalizeAssetTags(tags: string[] | undefined): string[] {
  if (!Array.isArray(tags)) {
    return []
  }

  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right, 'ru'),
  )
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}
