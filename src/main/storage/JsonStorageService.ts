import { access, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Campaign, CampaignId, CampaignSummary } from '../../shared/types/index.js'
import type { StorageService } from './StorageService.js'

export class JsonStorageService implements StorageService {
  private campaignsDirectory: string

  constructor(campaignsDirectory: string) {
    this.campaignsDirectory = path.resolve(campaignsDirectory)
  }

  async initialize(): Promise<void> {
    await mkdir(this.campaignsDirectory, { recursive: true })
  }

  getCampaignsDirectory(): string {
    return this.campaignsDirectory
  }

  async setCampaignsDirectory(campaignsDirectory: string): Promise<void> {
    const resolvedDirectory = path.resolve(campaignsDirectory)
    await mkdir(resolvedDirectory, { recursive: true })
    this.campaignsDirectory = resolvedDirectory
  }

  async listCampaigns(): Promise<CampaignSummary[]> {
    await this.initialize()

    const entries = await readdir(this.campaignsDirectory, { withFileTypes: true })
    const campaigns = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => this.readCampaignFile(path.join(this.campaignsDirectory, entry.name))),
    )

    return campaigns
      .filter((campaign): campaign is Campaign => campaign !== null)
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        updatedAt: campaign.updatedAt,
        sceneCount: campaign.scenes.length,
        assetCount: campaign.assets.length,
        characterCount: campaign.characterCards.length,
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  async loadCampaign(campaignId: CampaignId): Promise<Campaign | null> {
    await this.initialize()
    return this.readCampaignFile(this.getCampaignFilePath(campaignId))
  }

  async saveCampaign(campaign: Campaign): Promise<void> {
    await this.initialize()

    const campaignFilePath = this.getCampaignFilePath(campaign.id)
    const payload = `${JSON.stringify(campaign, null, 2)}\n`
    await this.rotateBackups(campaign.id, campaignFilePath)
    await writeFile(campaignFilePath, payload, 'utf8')
  }

  async deleteCampaign(campaignId: CampaignId): Promise<void> {
    await rm(this.getCampaignFilePath(campaignId), { force: true })
    await Promise.all(([1, 2] as const).map((slot) => rm(this.getBackupFilePath(campaignId, slot), { force: true })))
  }

  private async readCampaignFile(filePath: string): Promise<Campaign | null> {
    try {
      const content = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(content) as unknown

      if (!this.isCampaign(parsed)) {
        return null
      }

      return parsed
    } catch (error) {
      if (error instanceof SyntaxError) {
        return null
      }

      if (isNodeError(error) && error.code === 'ENOENT') {
        return null
      }

      throw error
    }
  }

  private getCampaignFilePath(campaignId: CampaignId): string {
    const fileName = `${campaignId}.json`

    if (path.basename(fileName) !== fileName || fileName.includes('/') || fileName.includes('\\')) {
      throw new Error(`Invalid campaign id: ${campaignId}`)
    }

    return path.join(this.campaignsDirectory, fileName)
  }

  private async rotateBackups(campaignId: CampaignId, campaignFilePath: string): Promise<void> {
    if (!(await fileExists(campaignFilePath))) {
      return
    }

    await mkdir(this.getBackupsDirectory(), { recursive: true })

    const firstBackup = this.getBackupFilePath(campaignId, 1)
    const secondBackup = this.getBackupFilePath(campaignId, 2)

    await rm(secondBackup, { force: true })
    await rename(firstBackup, secondBackup).catch((error: unknown) => {
      if (!isNodeError(error) || error.code !== 'ENOENT') {
        throw error
      }
    })
    await copyFile(campaignFilePath, firstBackup)
  }

  private getBackupsDirectory(): string {
    return path.join(this.campaignsDirectory, '.backups')
  }

  private getBackupFilePath(campaignId: CampaignId, slot: 1 | 2): string {
    const fileName = `${campaignId}.backup-${slot}.json`

    if (path.basename(fileName) !== fileName || fileName.includes('/') || fileName.includes('\\')) {
      throw new Error(`Invalid campaign id: ${campaignId}`)
    }

    return path.join(this.getBackupsDirectory(), fileName)
  }

  private isCampaign(value: unknown): value is Campaign {
    if (!isRecord(value)) {
      return false
    }

    return (
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      typeof value.createdAt === 'string' &&
      typeof value.updatedAt === 'string' &&
      Array.isArray(value.scenes) &&
      Array.isArray(value.assets) &&
      Array.isArray(value.characterCards) &&
      Array.isArray(value.notes)
    )
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

async function fileExists(filePath: string): Promise<boolean> {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
