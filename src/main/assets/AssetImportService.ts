import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AssetId, ImportImageAssetRequest, ImportImageAssetResult } from '../../shared/types/index.js'

export type ImageFilePicker = () => Promise<string | null>

const supportedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.jfif'])

export class AssetImportService {
  constructor(
    private readonly campaignsDirectory: string,
    private readonly pickImageFile: ImageFilePicker,
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
      const targetDirectory = this.getCampaignAssetsDirectory(request.campaignId)
      const targetFilePath = path.join(targetDirectory, `${assetId}${extension}`)
      const originalFileName = path.basename(sourceFilePath)

      await mkdir(targetDirectory, { recursive: true })
      await copyFile(sourceFilePath, targetFilePath)

      return {
        ok: true,
        asset: {
          id: assetId,
          campaignId: request.campaignId,
          kind: request.kind,
          name: normalizeAssetName(request.suggestedName ?? path.parse(originalFileName).name),
          filePath: pathToFileURL(targetFilePath).toString(),
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

  private getCampaignAssetsDirectory(campaignId: string): string {
    if (path.basename(campaignId) !== campaignId || campaignId.includes('/') || campaignId.includes('\\')) {
      throw new Error(`Invalid campaign id: ${campaignId}`)
    }

    return path.join(this.campaignsDirectory, campaignId, 'assets')
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
