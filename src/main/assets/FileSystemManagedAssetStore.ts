import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isSha256Digest } from '../../shared/assetStorage.js'
import type { ManagedAssetBlob, Sha256Digest } from '../../shared/types/index.js'
import { createManagedAssetRelativePath } from './CampaignAssetResolver.js'
import type {
  ManagedAssetRegistry,
  ManagedAssetStore,
  PutManagedAssetInput,
} from './hybridStorageContracts.js'

export type ManagedAssetStoreErrorCode =
  | 'invalid-input'
  | 'source-unavailable'
  | 'source-changed'
  | 'storage-failed'

export class ManagedAssetStoreError extends Error {
  constructor(
    readonly code: ManagedAssetStoreErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'ManagedAssetStoreError'
  }
}

export class FileSystemManagedAssetStore implements ManagedAssetStore {
  private readonly rootDirectory: string
  private readonly stagingDirectory: string
  private initializePromise: Promise<void> | null = null
  private operationQueue: Promise<void> = Promise.resolve()

  constructor(
    rootDirectory: string,
    private readonly registry: ManagedAssetRegistry,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.rootDirectory = path.resolve(rootDirectory)
    this.stagingDirectory = path.join(this.rootDirectory, 'staging')
  }

  initialize(): Promise<void> {
    this.initializePromise ??= this.initializeInternal()
    return this.initializePromise
  }

  async put(input: PutManagedAssetInput): Promise<ManagedAssetBlob> {
    await this.initialize()
    return this.enqueueOperation(() => this.putInternal(input))
  }

  async get(sha256: Sha256Digest): Promise<ManagedAssetBlob | null> {
    await this.initialize()
    await this.operationQueue
    return this.registry.getManagedBlob(sha256)
  }

  async resolveFileUrl(sha256: Sha256Digest): Promise<string | null> {
    const blob = await this.get(sha256)
    if (!blob) {
      return null
    }

    try {
      const filePath = this.resolveBlobPath(blob.relativePath)
      return (await stat(filePath)).isFile() ? pathToFileURL(filePath).toString() : null
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) {
        return null
      }
      throw error
    }
  }

  async verify(sha256: Sha256Digest): Promise<boolean> {
    await this.initialize()
    return this.enqueueOperation(async () => {
      const blob = await this.registry.getManagedBlob(sha256)
      if (!blob || !(await this.verifyStoredBlob(blob))) {
        return false
      }
      await this.registry.saveManagedBlob({ ...blob, verifiedAt: this.now().toISOString() })
      return true
    })
  }

  async deleteIfUnreferenced(sha256: Sha256Digest): Promise<ManagedAssetBlob | null> {
    await this.initialize()
    return this.enqueueOperation(async () => {
      const blob = await this.registry.deleteManagedBlobIfUnreferenced(sha256)
      if (!blob) {
        return null
      }

      try {
        await rm(this.resolveBlobPath(blob.relativePath), { force: true })
        return blob
      } catch (error) {
        await this.registry.saveManagedBlob(blob)
        throw new ManagedAssetStoreError('storage-failed', 'Could not delete managed asset blob', {
          cause: error,
        })
      }
    })
  }

  private async initializeInternal(): Promise<void> {
    await mkdir(this.rootDirectory, { recursive: true })
    await rm(this.stagingDirectory, { recursive: true, force: true })
    await mkdir(this.stagingDirectory, { recursive: true })
  }

  private async putInternal(input: PutManagedAssetInput): Promise<ManagedAssetBlob> {
    validatePutInput(input)
    const existingBlob = await this.registry.getManagedBlob(input.sha256)

    if (existingBlob && (await this.verifyStoredBlob(existingBlob))) {
      const verifiedBlob = { ...existingBlob, verifiedAt: this.now().toISOString() }
      await this.registry.saveManagedBlob(verifiedBlob)
      return verifiedBlob
    }

    const relativePath =
      existingBlob?.relativePath ?? createManagedAssetRelativePath(input.sha256, input.fileExtension)
    const targetFilePath = this.resolveBlobPath(relativePath)
    const stagedFilePath = path.join(this.stagingDirectory, `${input.sha256}-${randomUUID()}.tmp`)

    try {
      await copyFile(input.sourceFilePath, stagedFilePath)
    } catch (error) {
      throw new ManagedAssetStoreError('source-unavailable', 'Could not read managed asset source', {
        cause: error,
      })
    }

    try {
      const stagedFileStat = await stat(stagedFilePath)
      const actualSha256 = await hashFile(stagedFilePath)
      if (stagedFileStat.size !== input.byteSize || actualSha256 !== input.sha256) {
        throw new ManagedAssetStoreError(
          'source-changed',
          'Managed asset source changed after it was indexed',
        )
      }

      await mkdir(path.dirname(targetFilePath), { recursive: true })
      await this.installStagedFile(stagedFilePath, targetFilePath, input.sha256, input.byteSize)

      const timestamp = this.now().toISOString()
      const blob: ManagedAssetBlob = {
        sha256: input.sha256,
        relativePath,
        byteSize: input.byteSize,
        mimeType: input.mimeType,
        fileExtension: path.extname(relativePath),
        createdAt: existingBlob?.createdAt ?? timestamp,
        verifiedAt: timestamp,
      }
      try {
        await this.registry.saveManagedBlob(blob)
      } catch (error) {
        if (!existingBlob) {
          await rm(targetFilePath, { force: true }).catch(() => undefined)
        }
        throw new ManagedAssetStoreError('storage-failed', 'Could not persist managed asset metadata', {
          cause: error,
        })
      }
      return blob
    } catch (error) {
      await rm(stagedFilePath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private async installStagedFile(
    stagedFilePath: string,
    targetFilePath: string,
    sha256: Sha256Digest,
    byteSize: number,
  ): Promise<void> {
    if (await verifyFile(targetFilePath, sha256, byteSize)) {
      await rm(stagedFilePath, { force: true })
      return
    }

    const backupFilePath = `${targetFilePath}.corrupt-${randomUUID()}`
    let hasBackup = false
    try {
      try {
        await rename(targetFilePath, backupFilePath)
        hasBackup = true
      } catch (error) {
        if (!isNodeError(error, 'ENOENT')) {
          throw error
        }
      }
      await rename(stagedFilePath, targetFilePath)
      if (hasBackup) {
        await rm(backupFilePath, { force: true })
      }
    } catch (error) {
      if (hasBackup) {
        await rename(backupFilePath, targetFilePath).catch(() => undefined)
      }
      throw new ManagedAssetStoreError('storage-failed', 'Could not install managed asset blob', {
        cause: error,
      })
    }
  }

  private async verifyStoredBlob(blob: ManagedAssetBlob): Promise<boolean> {
    return verifyFile(this.resolveBlobPath(blob.relativePath), blob.sha256, blob.byteSize)
  }

  private resolveBlobPath(relativePath: string): string {
    const filePath = path.resolve(this.rootDirectory, ...relativePath.split('/'))
    const pathFromRoot = path.relative(this.rootDirectory, filePath)
    if (pathFromRoot.startsWith('..') || path.isAbsolute(pathFromRoot)) {
      throw new ManagedAssetStoreError('storage-failed', 'Managed asset path escapes the store root')
    }
    return filePath
  }

  private enqueueOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const queuedOperation = this.operationQueue.then(operation)
    this.operationQueue = queuedOperation.then(
      () => undefined,
      () => undefined,
    )
    return queuedOperation
  }
}

function validatePutInput(input: PutManagedAssetInput): void {
  if (
    !isSha256Digest(input.sha256) ||
    !path.isAbsolute(input.sourceFilePath) ||
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize < 0 ||
    input.mimeType.trim() === ''
  ) {
    throw new ManagedAssetStoreError('invalid-input', 'Invalid managed asset input')
  }
}

async function verifyFile(filePath: string, sha256: Sha256Digest, byteSize: number): Promise<boolean> {
  try {
    const fileStat = await stat(filePath)
    return fileStat.isFile() && fileStat.size === byteSize && (await hashFile(filePath)) === sha256
  } catch (error) {
    if (isNodeError(error, 'ENOENT')) {
      return false
    }
    throw error
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code
}
