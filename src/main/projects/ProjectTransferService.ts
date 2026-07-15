import { randomUUID } from 'node:crypto'
import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  Asset,
  Campaign,
  CampaignId,
  ManagedCampaignAssetReference,
  ProjectExportPreviewResult,
  ProjectExportResult,
  ProjectImportResult,
} from '../../shared/types/index.js'
import type { ManagedAssetStore } from '../assets/hybridStorageContracts.js'
import type { StorageService } from '../storage/StorageService.js'
import {
  CampaignExportPlanError,
  CampaignExportPlanner,
  type CampaignExportAssetPlan,
  type CampaignExportPlan,
} from './CampaignExportPlanner.js'
import {
  createPortableAssetPath,
  LEGACY_PROJECT_PACKAGE_VERSION,
  PROJECT_MANIFEST_SCHEMA,
  PROJECT_PACKAGE_FORMAT,
  PROJECT_PACKAGE_VERSION,
  readProjectPackage,
  type PortableProjectPackageV1,
  type PortableProjectPackageV2,
  type ProjectPackageManifestAssetV2,
  type ProjectPackageManifestBlobV2,
} from './projectPackageContracts.js'

export class ProjectTransferService {
  private readonly exportPlanner: CampaignExportPlanner
  private pendingExportPlan: CampaignExportPlan | null = null

  constructor(
    private readonly storageService: StorageService,
    private readonly managedAssetStore: ManagedAssetStore,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.exportPlanner = new CampaignExportPlanner(managedAssetStore, now)
  }

  async previewCampaignExport(campaignId: CampaignId): Promise<ProjectExportPreviewResult> {
    const campaign = await this.storageService.loadCampaign(campaignId)
    if (!campaign) {
      return { ok: false, reason: 'campaign-not-found' }
    }

    try {
      const plan = await this.exportPlanner.createPlan(campaign)
      this.pendingExportPlan = plan
      return { ok: true, preview: plan.preview }
    } catch (error) {
      this.pendingExportPlan = null
      return {
        ok: false,
        reason: error instanceof CampaignExportPlanError ? error.reason : 'asset-read-failed',
      }
    }
  }

  async exportCampaign(
    campaignId: CampaignId,
    targetFilePath: string,
    previewToken: string,
  ): Promise<ProjectExportResult> {
    const plan = this.pendingExportPlan
    this.pendingExportPlan = null
    if (!plan || plan.preview.token !== previewToken || plan.preview.campaignId !== campaignId) {
      return { ok: false, reason: 'preview-outdated' }
    }

    const campaign = await this.storageService.loadCampaign(campaignId)
    if (!campaign) {
      return { ok: false, reason: 'campaign-not-found' }
    }
    if (campaign.updatedAt !== plan.preview.campaignUpdatedAt) {
      return { ok: false, reason: 'preview-outdated' }
    }

    try {
      const blobPayloads = []
      for (const blob of plan.blobs) {
        const contents = await this.exportPlanner.readVerifiedBlob(blob)
        blobPayloads.push({
          sha256: blob.sha256,
          relativePath: blob.relativePath,
          dataBase64: contents.toString('base64'),
        })
      }

      const packageAssets = plan.assets
        .filter((asset): asset is CampaignExportAssetPlan & { blob: NonNullable<CampaignExportAssetPlan['blob']> } =>
          asset.blob !== undefined,
        )
        .map<ProjectPackageManifestAssetV2>((asset) => ({
          assetId: asset.asset.id,
          fileName: asset.blob.fileName,
          sha256: asset.blob.sha256,
          byteSize: asset.blob.byteSize,
          mimeType: asset.blob.mimeType,
          relativePath: asset.blob.relativePath,
          inclusion: asset.preview.inclusion,
        }))
      const packageBlobs = plan.blobs.map<ProjectPackageManifestBlobV2>((blob) => ({
        sha256: blob.sha256,
        fileName: blob.fileName,
        byteSize: blob.byteSize,
        mimeType: blob.mimeType,
        relativePath: blob.relativePath,
      }))
      const portableCampaign = createPortableCampaign(campaign, plan.assets)
      const projectPackage: PortableProjectPackageV2 = {
        format: PROJECT_PACKAGE_FORMAT,
        version: PROJECT_PACKAGE_VERSION,
        exportedAt: this.now().toISOString(),
        manifest: {
          schema: PROJECT_MANIFEST_SCHEMA,
          version: PROJECT_PACKAGE_VERSION,
          campaignId: portableCampaign.id,
          campaignUpdatedAt: portableCampaign.updatedAt,
          assets: packageAssets,
          blobs: packageBlobs,
        },
        campaign: portableCampaign,
        blobs: blobPayloads,
      }

      if (!(await writeJsonAtomically(targetFilePath, projectPackage))) {
        return { ok: false, reason: 'write-failed' }
      }

      return {
        ok: true,
        campaignId,
        filePath: targetFilePath,
        exportedAssetCount: plan.assets.length,
        exportedBlobCount: plan.blobs.length,
        totalByteSize: plan.preview.totalByteSize,
      }
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof CampaignExportPlanError ? error.reason : 'asset-read-failed',
      }
    }
  }

  async importCampaign(sourceFilePath: string): Promise<ProjectImportResult> {
    const packageResult = await readProjectPackage(sourceFilePath)
    if (!packageResult.ok) {
      return packageResult
    }

    let importedCampaignId: CampaignId
    try {
      importedCampaignId = await this.resolveImportedCampaignId(packageResult.projectPackage.campaign.id)
    } catch {
      return { ok: false, reason: 'write-failed' }
    }

    return packageResult.projectPackage.version === PROJECT_PACKAGE_VERSION
      ? this.importVersionTwoPackage(packageResult.projectPackage, sourceFilePath, importedCampaignId)
      : this.importLegacyPackage(packageResult.projectPackage, sourceFilePath, importedCampaignId)
  }

  private async importVersionTwoPackage(
    projectPackage: PortableProjectPackageV2,
    sourceFilePath: string,
    importedCampaignId: CampaignId,
  ): Promise<ProjectImportResult> {
    const stagingDirectory = this.createImportStagingDirectory()
    const payloadBySha256 = new Map(projectPackage.blobs.map((blob) => [blob.sha256, blob]))
    const fileUrlBySha256 = new Map<string, string>()
    const importedSha256: string[] = []
    let importedBlobCount = 0
    let deduplicatedBlobCount = 0

    try {
      if (projectPackage.manifest.blobs.length > 0) {
        await mkdir(stagingDirectory, { recursive: true })
      }
      for (const blob of projectPackage.manifest.blobs) {
        const payload = payloadBySha256.get(blob.sha256)
        if (!payload) {
          throw new Error('Validated package payload is missing')
        }
        const existingBlob = await this.managedAssetStore.get(blob.sha256)
        const isDeduplicated = existingBlob !== null && (await this.managedAssetStore.verify(blob.sha256))
        const stagingFilePath = path.join(stagingDirectory, `${blob.sha256}${normalizeFileExtension(path.extname(blob.fileName))}`)
        await writeFile(stagingFilePath, Buffer.from(payload.dataBase64, 'base64'))
        const managedBlob = await this.managedAssetStore.put({
          sourceFilePath: stagingFilePath,
          sha256: blob.sha256,
          byteSize: blob.byteSize,
          mimeType: blob.mimeType,
          fileExtension: path.extname(blob.fileName),
        })
        const fileUrl = await this.managedAssetStore.resolveFileUrl(managedBlob.sha256)
        if (!fileUrl) {
          throw new Error('Imported managed blob could not be resolved')
        }
        fileUrlBySha256.set(blob.sha256, fileUrl)
        if (isDeduplicated) {
          deduplicatedBlobCount += 1
        } else {
          importedBlobCount += 1
          if (existingBlob === null) {
            importedSha256.push(blob.sha256)
          }
        }
      }

      const manifestAssetById = new Map(projectPackage.manifest.assets.map((asset) => [asset.assetId, asset]))
      const campaignWithPaths = rewriteVersionTwoImportedCampaign(
        projectPackage.campaign,
        manifestAssetById,
        fileUrlBySha256,
      )
      const importedCampaign = rewriteCampaignId(campaignWithPaths, importedCampaignId, this.now())
      await this.storageService.saveCampaign(importedCampaign)

      return {
        ok: true,
        campaign: importedCampaign,
        filePath: sourceFilePath,
        importedAssetCount: importedCampaign.assets.length,
        importedBlobCount,
        deduplicatedBlobCount,
        skippedBlobCount: 0,
        damagedBlobCount: 0,
        packageVersion: PROJECT_PACKAGE_VERSION,
        campaignIdChanged: importedCampaignId !== projectPackage.campaign.id,
      }
    } catch {
      await this.rollbackImport(importedCampaignId, importedSha256)
      return { ok: false, reason: 'write-failed' }
    } finally {
      await rm(stagingDirectory, { recursive: true, force: true })
    }
  }

  private async importLegacyPackage(
    projectPackage: PortableProjectPackageV1,
    sourceFilePath: string,
    importedCampaignId: CampaignId,
  ): Promise<ProjectImportResult> {
    const stagingDirectory = this.createImportStagingDirectory()
    const importedAssetData = new Map<string, ImportedLegacyAssetData>()
    const importedSha256: string[] = []
    let importedBlobCount = 0
    let deduplicatedBlobCount = 0

    try {
      if (projectPackage.assets.length > 0) {
        await mkdir(stagingDirectory, { recursive: true })
      }
      for (const asset of projectPackage.assets) {
        const contents = Buffer.from(asset.dataBase64, 'base64')
        const mimeType = inferMimeType(asset.fileName)
        const stagingFilePath = path.join(
          stagingDirectory,
          `${asset.sha256}${normalizeFileExtension(path.extname(asset.fileName))}`,
        )
        const existingBlob = await this.managedAssetStore.get(asset.sha256)
        const isDeduplicated = existingBlob !== null && (await this.managedAssetStore.verify(asset.sha256))
        await writeFile(stagingFilePath, contents)
        const managedBlob = await this.managedAssetStore.put({
          sourceFilePath: stagingFilePath,
          sha256: asset.sha256,
          byteSize: contents.byteLength,
          mimeType,
          fileExtension: path.extname(asset.fileName),
        })
        const fileUrl = await this.managedAssetStore.resolveFileUrl(managedBlob.sha256)
        if (!fileUrl) {
          throw new Error('Imported managed blob could not be resolved')
        }
        importedAssetData.set(asset.assetId, {
          fileUrl,
          fileName: asset.fileName,
          mimeType,
          byteSize: contents.byteLength,
          sha256: asset.sha256,
        })
        if (isDeduplicated) {
          deduplicatedBlobCount += 1
        } else {
          importedBlobCount += 1
          if (existingBlob === null) {
            importedSha256.push(asset.sha256)
          }
        }
      }

      const campaignWithPaths = rewriteLegacyImportedCampaign(projectPackage.campaign, importedAssetData)
      const importedCampaign = rewriteCampaignId(campaignWithPaths, importedCampaignId, this.now())
      await this.storageService.saveCampaign(importedCampaign)

      return {
        ok: true,
        campaign: importedCampaign,
        filePath: sourceFilePath,
        importedAssetCount: projectPackage.assets.length,
        importedBlobCount,
        deduplicatedBlobCount,
        skippedBlobCount: 0,
        damagedBlobCount: 0,
        packageVersion: LEGACY_PROJECT_PACKAGE_VERSION,
        campaignIdChanged: importedCampaignId !== projectPackage.campaign.id,
      }
    } catch {
      await this.rollbackImport(importedCampaignId, importedSha256)
      return { ok: false, reason: 'write-failed' }
    } finally {
      await rm(stagingDirectory, { recursive: true, force: true })
    }
  }

  private createImportStagingDirectory(): string {
    return path.join(this.storageService.getCampaignsDirectory(), `.project-import-${randomUUID()}`)
  }

  private async rollbackImport(campaignId: CampaignId, sha256Values: string[]): Promise<void> {
    await this.storageService.deleteCampaign(campaignId).catch(() => undefined)
    for (const sha256 of sha256Values) {
      await this.managedAssetStore.deleteIfUnreferenced(sha256).catch(() => undefined)
    }
  }

  private async resolveImportedCampaignId(requestedCampaignId: CampaignId): Promise<CampaignId> {
    if (isSafePathSegment(requestedCampaignId) && !(await this.campaignIdConflicts(requestedCampaignId))) {
      return requestedCampaignId
    }

    let campaignId: CampaignId
    do {
      campaignId = `campaign-${randomUUID()}`
    } while (await this.campaignIdConflicts(campaignId))
    return campaignId
  }

  private async campaignIdConflicts(campaignId: CampaignId): Promise<boolean> {
    if ((await this.storageService.loadCampaign(campaignId)) !== null) {
      return true
    }
    return pathExists(path.join(this.storageService.getCampaignsDirectory(), campaignId))
  }
}

interface ImportedLegacyAssetData {
  fileUrl: string
  fileName: string
  mimeType: string
  byteSize: number
  sha256: string
}

function createPortableCampaign(campaign: Campaign, planAssets: CampaignExportAssetPlan[]): Campaign {
  const planByAssetId = new Map(planAssets.map((asset) => [asset.asset.id, asset]))
  const portablePaths = new Map(
    planAssets
      .filter((asset) => asset.blob !== undefined)
      .map((asset) => [asset.asset.id, createPortableAssetPath(asset.asset.id)]),
  )

  return {
    ...campaign,
    assets: campaign.assets.map<Asset | null>((asset) => {
      const plan = planByAssetId.get(asset.id)
      if (!plan) {
        return null
      }
      if (!plan.blob) {
        return {
          ...asset,
          storageRef: { kind: 'embedded-data' as const },
        }
      }
      return {
        ...asset,
        filePath: portablePaths.get(asset.id)!,
        storageRef: createManagedStorageReference(asset, plan.blob),
      }
    }).filter((asset): asset is Asset => asset !== null),
    playerScreenState: rewritePlayerProjectionPaths(campaign, portablePaths),
  }
}

function createManagedStorageReference(
  asset: Asset,
  blob: NonNullable<CampaignExportAssetPlan['blob']>,
): ManagedCampaignAssetReference {
  return {
    kind: 'managed',
    sha256: blob.sha256,
    fileName: blob.fileName,
    mimeType: blob.mimeType,
    byteSize: blob.byteSize,
    ...(asset.storageRef?.kind !== 'embedded-data' && asset.storageRef?.indexedAssetId
      ? { indexedAssetId: asset.storageRef.indexedAssetId }
      : {}),
  }
}

function rewriteVersionTwoImportedCampaign(
  campaign: Campaign,
  manifestAssetById: ReadonlyMap<string, ProjectPackageManifestAssetV2>,
  fileUrlBySha256: ReadonlyMap<string, string>,
): Campaign {
  const assetPaths = new Map<string, string>()
  const assets = campaign.assets.map((asset) => {
    const manifestAsset = manifestAssetById.get(asset.id)
    if (!manifestAsset) {
      return asset.filePath.startsWith('data:')
        ? { ...asset, storageRef: { kind: 'embedded-data' as const } }
        : asset
    }
    const fileUrl = fileUrlBySha256.get(manifestAsset.sha256)
    if (!fileUrl) {
      throw new Error('Imported asset blob URL is missing')
    }
    assetPaths.set(asset.id, fileUrl)
    return {
      ...asset,
      filePath: fileUrl,
      storageRef: {
        kind: 'managed' as const,
        sha256: manifestAsset.sha256,
        fileName: manifestAsset.fileName,
        mimeType: manifestAsset.mimeType,
        byteSize: manifestAsset.byteSize,
        ...(asset.storageRef?.kind === 'managed' && asset.storageRef.indexedAssetId
          ? { indexedAssetId: asset.storageRef.indexedAssetId }
          : {}),
      },
    }
  })
  return {
    ...campaign,
    assets,
    playerScreenState: rewritePlayerProjectionPaths(campaign, assetPaths),
  }
}

function rewriteLegacyImportedCampaign(
  campaign: Campaign,
  importedAssets: ReadonlyMap<string, ImportedLegacyAssetData>,
): Campaign {
  const assetPaths = new Map([...importedAssets].map(([assetId, asset]) => [assetId, asset.fileUrl]))
  return {
    ...campaign,
    assets: campaign.assets.map((asset) => {
      const importedAsset = importedAssets.get(asset.id)
      if (!importedAsset) {
        return asset.filePath.startsWith('data:')
          ? { ...asset, storageRef: { kind: 'embedded-data' as const } }
          : asset
      }
      return {
        ...asset,
        filePath: importedAsset.fileUrl,
        storageRef: {
          kind: 'managed' as const,
          sha256: importedAsset.sha256,
          fileName: importedAsset.fileName,
          mimeType: importedAsset.mimeType,
          byteSize: importedAsset.byteSize,
        },
      }
    }),
    playerScreenState: rewritePlayerProjectionPaths(campaign, assetPaths),
  }
}

function rewritePlayerProjectionPaths(campaign: Campaign, assetPaths: ReadonlyMap<string, string>): Campaign['playerScreenState'] {
  const sceneCanvas = campaign.playerScreenState.sceneCanvas
  const resolvePath = (assetId: string, currentPath: string): string => assetPaths.get(assetId) ?? currentPath
  return {
    ...campaign.playerScreenState,
    sceneCanvas: sceneCanvas
      ? {
          ...sceneCanvas,
          backgroundAsset: sceneCanvas.backgroundAsset
            ? {
                ...sceneCanvas.backgroundAsset,
                filePath: resolvePath(sceneCanvas.backgroundAsset.id, sceneCanvas.backgroundAsset.filePath),
              }
            : undefined,
          objects: sceneCanvas.objects.map((object) => ({
            ...object,
            asset: object.asset
              ? {
                  ...object.asset,
                  filePath: resolvePath(object.asset.id, object.asset.filePath),
                }
              : undefined,
          })),
        }
      : undefined,
  }
}

function rewriteCampaignId(campaign: Campaign, campaignId: CampaignId, now: Date): Campaign {
  return {
    ...campaign,
    id: campaignId,
    updatedAt: now.toISOString(),
    scenes: campaign.scenes.map((scene) => ({ ...scene, campaignId })),
    assets: campaign.assets.map((asset) => ({ ...asset, campaignId })),
    characterCards: campaign.characterCards.map((card) => ({ ...card, campaignId })),
    notes: campaign.notes.map((note) => ({ ...note, campaignId })),
    combatState: { ...campaign.combatState, campaignId },
    playerScreenState: { ...campaign.playerScreenState, campaignId },
  }
}

async function writeJsonAtomically(targetFilePath: string, value: unknown): Promise<boolean> {
  const targetDirectory = path.dirname(targetFilePath)
  const temporaryFilePath = path.join(targetDirectory, `.${path.basename(targetFilePath)}.${randomUUID()}.tmp`)
  try {
    await mkdir(targetDirectory, { recursive: true })
    await writeFile(temporaryFilePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await rename(temporaryFilePath, targetFilePath)
    return true
  } catch {
    await rm(temporaryFilePath, { force: true })
    return false
  }
}

function normalizeFileExtension(extension: string): string {
  const normalized = extension.toLowerCase()
  return /^\.[a-z0-9]{1,10}$/.test(normalized) ? normalized : '.bin'
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

function isSafePathSegment(value: string): boolean {
  return value.length > 0 && path.basename(value) === value && !value.includes('/') && !value.includes('\\')
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
