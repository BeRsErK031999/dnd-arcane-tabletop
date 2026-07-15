import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import type {
  Asset,
  Campaign,
  CampaignId,
  ProjectExportResult,
  ProjectImportResult,
  ProjectTransferFailureReason,
} from '../../shared/types/index.js'
import type { StorageService } from '../storage/StorageService.js'

const PROJECT_PACKAGE_FORMAT = 'dnd-arcane-tabletop-campaign'
const PROJECT_PACKAGE_VERSION = 1
const PORTABLE_ASSET_PREFIX = 'arcane-project-asset:'

interface PortableAssetFile {
  assetId: string
  fileName: string
  sha256: string
  dataBase64: string
}

interface PortableProjectPackage {
  format: typeof PROJECT_PACKAGE_FORMAT
  version: typeof PROJECT_PACKAGE_VERSION
  exportedAt: string
  campaign: Campaign
  assets: PortableAssetFile[]
}

export class ProjectTransferService {
  constructor(private readonly storageService: StorageService) {}

  async exportCampaign(campaignId: CampaignId, targetFilePath: string): Promise<ProjectExportResult> {
    const campaign = await this.storageService.loadCampaign(campaignId)

    if (campaign === null) {
      return { ok: false, reason: 'campaign-not-found' }
    }

    const portablePaths = new Map<string, string>()
    const portableAssets: PortableAssetFile[] = []

    for (const asset of campaign.assets) {
      if (asset.filePath.startsWith('data:')) {
        continue
      }

      if (!asset.filePath.startsWith('file:')) {
        return { ok: false, reason: 'unsupported-asset-path' }
      }

      try {
        const sourceFilePath = fileURLToPath(asset.filePath)
        const fileContents = await readFile(sourceFilePath)
        portableAssets.push({
          assetId: asset.id,
          fileName: path.basename(sourceFilePath),
          sha256: createSha256(fileContents),
          dataBase64: fileContents.toString('base64'),
        })
        portablePaths.set(asset.id, createPortableAssetPath(asset.id))
      } catch {
        return { ok: false, reason: 'asset-read-failed' }
      }
    }

    const projectPackage: PortableProjectPackage = {
      format: PROJECT_PACKAGE_FORMAT,
      version: PROJECT_PACKAGE_VERSION,
      exportedAt: new Date().toISOString(),
      campaign: rewriteCampaignAssetPaths(campaign, portablePaths, 'portable'),
      assets: portableAssets,
    }

    if (!(await writeJsonAtomically(targetFilePath, projectPackage))) {
      return { ok: false, reason: 'write-failed' }
    }

    return {
      ok: true,
      campaignId,
      filePath: targetFilePath,
      exportedAssetCount: portableAssets.length,
    }
  }

  async importCampaign(sourceFilePath: string): Promise<ProjectImportResult> {
    const packageResult = await readProjectPackage(sourceFilePath)

    if (!packageResult.ok) {
      return packageResult
    }

    const projectPackage = packageResult.projectPackage
    const campaignsDirectory = this.storageService.getCampaignsDirectory()
    let importedCampaignId: CampaignId

    try {
      importedCampaignId = await this.resolveImportedCampaignId(projectPackage.campaign.id)
    } catch {
      return { ok: false, reason: 'write-failed' }
    }

    const campaignIdChanged = importedCampaignId !== projectPackage.campaign.id
    const stagingDirectory = path.join(campaignsDirectory, `.project-import-${randomUUID()}`)
    const targetCampaignDirectory = path.join(campaignsDirectory, importedCampaignId)
    const targetAssetsDirectory = path.join(targetCampaignDirectory, 'assets')
    const importedPaths = new Map<string, string>()
    let targetDirectoryAttached = false

    try {
      if (projectPackage.assets.length > 0) {
        await mkdir(stagingDirectory, { recursive: true })

        for (const [index, portableAsset] of projectPackage.assets.entries()) {
          const targetFileName = createImportedAssetFileName(portableAsset, index)
          const stagingFilePath = path.join(stagingDirectory, targetFileName)
          const targetFilePath = path.join(targetAssetsDirectory, targetFileName)
          await writeFile(stagingFilePath, Buffer.from(portableAsset.dataBase64, 'base64'))
          importedPaths.set(portableAsset.assetId, pathToFileURL(targetFilePath).toString())
        }

        await mkdir(targetCampaignDirectory, { recursive: true })
        targetDirectoryAttached = true
        await rename(stagingDirectory, targetAssetsDirectory)
      }

      const campaignWithAssetPaths = rewriteCampaignAssetPaths(projectPackage.campaign, importedPaths, 'local')
      const importedCampaign = rewriteCampaignId(campaignWithAssetPaths, importedCampaignId)
      await this.storageService.saveCampaign(importedCampaign)

      return {
        ok: true,
        campaign: importedCampaign,
        filePath: sourceFilePath,
        importedAssetCount: projectPackage.assets.length,
        campaignIdChanged,
      }
    } catch {
      await rm(stagingDirectory, { recursive: true, force: true })
      await this.storageService.deleteCampaign(importedCampaignId).catch(() => undefined)

      if (targetDirectoryAttached) {
        await rm(targetCampaignDirectory, { recursive: true, force: true })
      }

      return { ok: false, reason: 'write-failed' }
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

type ProjectPackageReadResult =
  | { ok: true; projectPackage: PortableProjectPackage }
  | { ok: false; reason: ProjectTransferFailureReason }

async function readProjectPackage(sourceFilePath: string): Promise<ProjectPackageReadResult> {
  let parsed: unknown

  try {
    parsed = JSON.parse(await readFile(sourceFilePath, 'utf8')) as unknown
  } catch (error) {
    return { ok: false, reason: error instanceof SyntaxError ? 'invalid-package' : 'read-failed' }
  }

  if (isRecord(parsed) && parsed.format === PROJECT_PACKAGE_FORMAT && parsed.version !== PROJECT_PACKAGE_VERSION) {
    return { ok: false, reason: 'unsupported-version' }
  }

  if (!isPortableProjectPackage(parsed)) {
    return { ok: false, reason: 'invalid-package' }
  }

  return { ok: true, projectPackage: parsed }
}

function isPortableProjectPackage(value: unknown): value is PortableProjectPackage {
  if (
    !isRecord(value) ||
    value.format !== PROJECT_PACKAGE_FORMAT ||
    value.version !== PROJECT_PACKAGE_VERSION ||
    typeof value.exportedAt !== 'string' ||
    !isCampaign(value.campaign) ||
    !Array.isArray(value.assets)
  ) {
    return false
  }

  const portableAssets = value.assets

  if (!portableAssets.every(isPortableAssetFile)) {
    return false
  }

  const assetIds = portableAssets.map((asset) => asset.assetId)

  if (new Set(assetIds).size !== assetIds.length) {
    return false
  }

  const portableAssetIds = new Set(assetIds)
  const referencedPortableAssetIds = new Set<string>()

  for (const asset of value.campaign.assets) {
    if (asset.filePath.startsWith(PORTABLE_ASSET_PREFIX)) {
      const assetId = readPortableAssetId(asset.filePath)

      if (
        assetId === null ||
        assetId !== asset.id ||
        !portableAssetIds.has(assetId) ||
        asset.storageRef !== undefined
      ) {
        return false
      }

      referencedPortableAssetIds.add(assetId)
      continue
    }

    if (!asset.filePath.startsWith('data:') || !hasSafeEmbeddedStorageReference(asset)) {
      return false
    }
  }

  return (
    referencedPortableAssetIds.size === portableAssetIds.size &&
    hasSafePlayerProjectionAssetPaths(value.campaign, portableAssetIds)
  )
}

function isPortableAssetFile(value: unknown): value is PortableAssetFile {
  return (
    isRecord(value) &&
    typeof value.assetId === 'string' &&
    value.assetId.length > 0 &&
    typeof value.fileName === 'string' &&
    isSafeFileName(value.fileName) &&
    typeof value.sha256 === 'string' &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    typeof value.dataBase64 === 'string' &&
    isValidBase64(value.dataBase64) &&
    createSha256(Buffer.from(value.dataBase64, 'base64')) === value.sha256
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
        isOptionalSha256(value.sha256) &&
        (value.indexedAssetId === undefined || typeof value.indexedAssetId === 'string')
      )
    case 'managed':
      return (
        typeof value.sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(value.sha256) &&
        typeof value.fileName === 'string' &&
        typeof value.mimeType === 'string' &&
        typeof value.byteSize === 'number' &&
        Number.isSafeInteger(value.byteSize) &&
        value.byteSize >= 0 &&
        (value.indexedAssetId === undefined || typeof value.indexedAssetId === 'string')
      )
    default:
      return false
  }
}

function isOptionalSha256(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
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

function rewriteCampaignAssetPaths(
  campaign: Campaign,
  assetPaths: ReadonlyMap<string, string>,
  mode: 'portable' | 'local',
): Campaign {
  const resolvePath = (assetId: string, currentPath: string): string => assetPaths.get(assetId) ?? currentPath
  const sceneCanvas = campaign.playerScreenState.sceneCanvas

  return {
    ...campaign,
    assets: campaign.assets.map((asset) => {
      const resolvedPath = resolvePath(asset.id, asset.filePath)
      const hasRewrittenPath = assetPaths.has(asset.id)

      return {
        ...asset,
        filePath: resolvedPath,
        storageRef: hasRewrittenPath
          ? mode === 'portable'
            ? undefined
            : { kind: 'legacy-file', fileUrl: resolvedPath }
          : asset.storageRef,
      }
    }),
    playerScreenState: {
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
    },
  }
}

function rewriteCampaignId(campaign: Campaign, campaignId: CampaignId): Campaign {
  return {
    ...campaign,
    id: campaignId,
    updatedAt: new Date().toISOString(),
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

function createPortableAssetPath(assetId: string): string {
  return `${PORTABLE_ASSET_PREFIX}${encodeURIComponent(assetId)}`
}

function readPortableAssetId(filePath: string): string | null {
  try {
    return decodeURIComponent(filePath.slice(PORTABLE_ASSET_PREFIX.length))
  } catch {
    return null
  }
}

function createImportedAssetFileName(asset: PortableAssetFile, index: number): string {
  const extension = normalizeFileExtension(path.extname(asset.fileName))
  const safeAssetId = asset.assetId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100) || 'asset'
  return `${index + 1}-${safeAssetId}${extension}`
}

function normalizeFileExtension(extension: string): string {
  const normalized = extension.toLowerCase()
  return /^\.[a-z0-9]{1,10}$/.test(normalized) ? normalized : '.bin'
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

function isSafePathSegment(value: string): boolean {
  return value.length > 0 && path.basename(value) === value && !value.includes('/') && !value.includes('\\')
}

function isValidBase64(value: string): boolean {
  return value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)
}

function createSha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
