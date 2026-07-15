import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs, { type BindParams, type Database, type ParamsObject, type SqlValue } from 'sql.js'
import type {
  AssetLibrarySource,
  AssetLibrarySourceId,
  CampaignAssetBinding,
  IndexedAsset,
  IndexedAssetId,
  ManagedAssetBlob,
  Sha256Digest,
} from '../../../shared/types/index.js'
import type { HybridAssetCatalog, IndexedAssetPage, IndexedAssetQuery } from '../hybridStorageContracts.js'
import {
  migrateAssetCatalog,
  type AssetCatalogMigrationDatabase,
} from './assetCatalogMigrations.js'

const require = createRequire(import.meta.url)
const sqlJsWasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
const sqlJsPromise = initSqlJs({
  locateFile: () => sqlJsWasmPath,
})

export class SqlJsAssetCatalog implements HybridAssetCatalog, AssetCatalogMigrationDatabase {
  private database: Database | null = null
  private initializePromise: Promise<void> | null = null
  private writeQueue: Promise<void> = Promise.resolve()

  constructor(private readonly databaseFilePath: string) {}

  initialize(): Promise<void> {
    this.initializePromise ??= this.initializeInternal()
    return this.initializePromise
  }

  async close(): Promise<void> {
    await this.initialize()
    await this.writeQueue
    this.requireDatabase().close()
    this.database = null
    this.initializePromise = null
  }

  async getUserVersion(): Promise<number> {
    const rows = this.requireDatabase().exec('PRAGMA user_version')
    const value = rows[0]?.values[0]?.[0]
    return typeof value === 'number' ? value : 0
  }

  async exec(statement: string): Promise<void> {
    this.requireDatabase().run(statement)
  }

  async listSources(): Promise<AssetLibrarySource[]> {
    await this.waitUntilReadable()
    return this.queryRows('SELECT * FROM asset_library_sources ORDER BY display_name COLLATE NOCASE, root_path').map(
      mapSource,
    )
  }

  async getSource(sourceId: AssetLibrarySourceId): Promise<AssetLibrarySource | null> {
    await this.waitUntilReadable()
    return this.queryOne('SELECT * FROM asset_library_sources WHERE id = ?', [sourceId], mapSource)
  }

  async findSourceByRootPath(rootPath: string): Promise<AssetLibrarySource | null> {
    await this.waitUntilReadable()
    return this.queryOne('SELECT * FROM asset_library_sources WHERE root_path = ?', [rootPath], mapSource)
  }

  async saveSource(source: AssetLibrarySource): Promise<void> {
    await this.initialize()
    await this.enqueueWrite(() => {
      this.requireDatabase().run(
        `INSERT INTO asset_library_sources (
          id, root_path, display_name, status, created_at, updated_at,
          last_scan_started_at, last_scan_completed_at, last_error
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          root_path = excluded.root_path,
          display_name = excluded.display_name,
          status = excluded.status,
          updated_at = excluded.updated_at,
          last_scan_started_at = excluded.last_scan_started_at,
          last_scan_completed_at = excluded.last_scan_completed_at,
          last_error = excluded.last_error`,
        [
          source.id,
          source.rootPath,
          source.displayName,
          source.status,
          source.createdAt,
          source.updatedAt,
          source.lastScanStartedAt ?? null,
          source.lastScanCompletedAt ?? null,
          source.lastError ?? null,
        ],
      )
    })
  }

  async removeSource(sourceId: AssetLibrarySourceId): Promise<void> {
    await this.initialize()
    await this.enqueueWrite(() => {
      this.requireDatabase().run('DELETE FROM asset_library_sources WHERE id = ?', [sourceId])
    })
  }

  async getAsset(assetId: IndexedAssetId): Promise<IndexedAsset | null> {
    await this.waitUntilReadable()
    return this.getAssetByWhereClause('indexed_assets.id = ?', [assetId])
  }

  async getAssetByCanonicalPath(
    sourceId: AssetLibrarySourceId,
    canonicalPath: string,
  ): Promise<IndexedAsset | null> {
    await this.waitUntilReadable()
    return this.getAssetByWhereClause('indexed_assets.source_id = ? AND indexed_assets.canonical_path = ?', [
      sourceId,
      canonicalPath,
    ])
  }

  async findBySha256(sha256: Sha256Digest): Promise<IndexedAsset[]> {
    await this.waitUntilReadable()
    const rows = this.queryRows('SELECT * FROM indexed_assets WHERE sha256 = ? ORDER BY file_name COLLATE NOCASE', [
      sha256,
    ])
    return this.attachTags(rows.map(mapAsset))
  }

  async queryAssets(query: IndexedAssetQuery): Promise<IndexedAssetPage> {
    await this.waitUntilReadable()

    const clauses: string[] = []
    const parameters: SqlValue[] = []
    appendInFilter(clauses, parameters, 'indexed_assets.source_id', query.sourceIds)
    appendInFilter(clauses, parameters, 'indexed_assets.format', query.formats)
    appendInFilter(clauses, parameters, 'indexed_assets.availability', query.availability)

    const search = query.search?.trim()
    if (search) {
      clauses.push(`(
        unicode_lower(indexed_assets.file_name) LIKE unicode_lower(?) ESCAPE '\\' OR
        unicode_lower(indexed_assets.relative_path) LIKE unicode_lower(?) ESCAPE '\\' OR
        EXISTS (
          SELECT 1 FROM indexed_asset_tags search_tag
          WHERE search_tag.asset_id = indexed_assets.id AND
            unicode_lower(search_tag.tag) LIKE unicode_lower(?) ESCAPE '\\'
        )
      )`)
      const pattern = `%${escapeLikePattern(search)}%`
      parameters.push(pattern, pattern, pattern)
    }

    if (query.minByteSize !== undefined) {
      clauses.push('indexed_assets.byte_size >= ?')
      parameters.push(Math.max(0, Math.trunc(query.minByteSize)))
    }

    if (query.maxByteSize !== undefined) {
      clauses.push('indexed_assets.byte_size <= ?')
      parameters.push(Math.max(0, Math.trunc(query.maxByteSize)))
    }

    for (const tag of normalizeTags(query.tags ?? [])) {
      clauses.push(
        'EXISTS (SELECT 1 FROM indexed_asset_tags tag_filter WHERE tag_filter.asset_id = indexed_assets.id AND tag_filter.tag = ?)',
      )
      parameters.push(tag)
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const countRow = this.queryRows(`SELECT COUNT(*) AS total FROM indexed_assets ${whereClause}`, parameters)[0]
    const total = readNumber(countRow, 'total')
    const limit = Math.max(1, Math.min(2_000, Math.trunc(query.limit)))
    const offset = Math.max(0, Math.trunc(query.offset))
    const rows = this.queryRows(
      `SELECT * FROM indexed_assets ${whereClause}
       ORDER BY file_name COLLATE NOCASE, relative_path COLLATE NOCASE
       LIMIT ? OFFSET ?`,
      [...parameters, limit, offset],
    )

    return {
      items: this.attachTags(rows.map(mapAsset)),
      total,
      offset,
      limit,
    }
  }

  async saveAsset(asset: IndexedAsset): Promise<void> {
    await this.saveAssets([asset])
  }

  async saveAssets(assets: IndexedAsset[], scanId?: string): Promise<void> {
    if (assets.length === 0) {
      return
    }

    await this.initialize()
    await this.enqueueWrite(() => {
      const database = this.requireDatabase()
      const assetStatement = database.prepare(
        `INSERT INTO indexed_assets (
          id, source_id, canonical_path, relative_path, file_name, byte_size, modified_at,
          kind, mime_type, format, width, height, sha256, preview_path, availability,
          indexed_at, last_seen_scan_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_id = excluded.source_id,
          canonical_path = excluded.canonical_path,
          relative_path = excluded.relative_path,
          file_name = excluded.file_name,
          byte_size = excluded.byte_size,
          modified_at = excluded.modified_at,
          kind = excluded.kind,
          mime_type = excluded.mime_type,
          format = excluded.format,
          width = excluded.width,
          height = excluded.height,
          sha256 = excluded.sha256,
          preview_path = excluded.preview_path,
          availability = excluded.availability,
          indexed_at = excluded.indexed_at,
          last_seen_scan_id = excluded.last_seen_scan_id`,
      )
      const deleteTagsStatement = database.prepare('DELETE FROM indexed_asset_tags WHERE asset_id = ?')
      const insertTagStatement = database.prepare('INSERT INTO indexed_asset_tags (asset_id, tag) VALUES (?, ?)')

      try {
        for (const asset of assets) {
          assetStatement.run([
            asset.id,
            asset.sourceId,
            asset.canonicalPath,
            asset.relativePath,
            asset.fileName,
            asset.byteSize,
            asset.modifiedAt,
            asset.kind,
            asset.mimeType,
            asset.format,
            asset.width,
            asset.height,
            asset.sha256 ?? null,
            asset.previewPath ?? null,
            asset.availability,
            asset.indexedAt,
            scanId ?? null,
          ])
          deleteTagsStatement.run([asset.id])
          for (const tag of normalizeTags(asset.tags)) {
            insertTagStatement.run([asset.id, tag])
          }
        }
      } finally {
        assetStatement.free()
        deleteTagsStatement.free()
        insertTagStatement.free()
      }
    })
  }

  async markSourceAssetsMissing(sourceId: AssetLibrarySourceId, completedScanId: string): Promise<void> {
    await this.initialize()
    await this.enqueueWrite(() => {
      this.requireDatabase().run(
        `UPDATE indexed_assets
         SET availability = 'missing'
         WHERE source_id = ? AND (last_seen_scan_id IS NULL OR last_seen_scan_id <> ?)`,
        [sourceId, completedScanId],
      )
    })
  }

  async updateTags(assetId: IndexedAssetId, tags: string[]): Promise<void> {
    await this.initialize()
    await this.enqueueWrite(() => {
      const database = this.requireDatabase()
      database.run('DELETE FROM indexed_asset_tags WHERE asset_id = ?', [assetId])
      const statement = database.prepare('INSERT INTO indexed_asset_tags (asset_id, tag) VALUES (?, ?)')
      try {
        for (const tag of normalizeTags(tags)) {
          statement.run([assetId, tag])
        }
      } finally {
        statement.free()
      }
    })
  }

  async getManagedBlob(sha256: Sha256Digest): Promise<ManagedAssetBlob | null> {
    await this.waitUntilReadable()
    return this.queryOne('SELECT * FROM managed_asset_blobs WHERE sha256 = ?', [sha256], mapManagedBlob)
  }

  async saveManagedBlob(blob: ManagedAssetBlob): Promise<void> {
    await this.initialize()
    await this.enqueueWrite(() => {
      this.requireDatabase().run(
        `INSERT INTO managed_asset_blobs (
          sha256, relative_path, byte_size, mime_type, file_extension, created_at, verified_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sha256) DO UPDATE SET
          relative_path = excluded.relative_path,
          byte_size = excluded.byte_size,
          mime_type = excluded.mime_type,
          file_extension = excluded.file_extension,
          verified_at = excluded.verified_at`,
        [
          blob.sha256,
          blob.relativePath,
          blob.byteSize,
          blob.mimeType,
          blob.fileExtension,
          blob.createdAt,
          blob.verifiedAt ?? null,
        ],
      )
    })
  }

  async listUnreferencedManagedBlobs(): Promise<ManagedAssetBlob[]> {
    await this.waitUntilReadable()
    return this.queryRows(
      `SELECT managed_asset_blobs.*
       FROM managed_asset_blobs
       LEFT JOIN campaign_asset_references
         ON campaign_asset_references.sha256 = managed_asset_blobs.sha256
       WHERE campaign_asset_references.sha256 IS NULL
       ORDER BY managed_asset_blobs.created_at, managed_asset_blobs.sha256`,
    ).map(mapManagedBlob)
  }

  async deleteManagedBlobIfUnreferenced(sha256: Sha256Digest): Promise<ManagedAssetBlob | null> {
    await this.initialize()
    return this.enqueueWrite(() => {
      const blob = this.queryOne(
        `SELECT managed_asset_blobs.*
         FROM managed_asset_blobs
         WHERE managed_asset_blobs.sha256 = ? AND NOT EXISTS (
           SELECT 1 FROM campaign_asset_references
           WHERE campaign_asset_references.sha256 = managed_asset_blobs.sha256
         )`,
        [sha256],
        mapManagedBlob,
      )
      if (!blob) {
        return null
      }
      this.requireDatabase().run('DELETE FROM managed_asset_blobs WHERE sha256 = ?', [sha256])
      return blob
    })
  }

  async saveCampaignAssetBinding(binding: CampaignAssetBinding): Promise<void> {
    await this.initialize()
    await this.enqueueWrite(() => saveCampaignBinding(this.requireDatabase(), binding))
  }

  async replaceCampaignAssetBindings(campaignId: string, bindings: CampaignAssetBinding[]): Promise<void> {
    await this.initialize()
    await this.enqueueWrite(() => {
      const database = this.requireDatabase()
      database.run('DELETE FROM campaign_asset_references WHERE campaign_id = ?', [campaignId])
      for (const binding of bindings) {
        saveCampaignBinding(database, binding)
      }
    })
  }

  async removeCampaignAssetBindings(campaignId: string): Promise<void> {
    await this.initialize()
    await this.enqueueWrite(() => {
      this.requireDatabase().run('DELETE FROM campaign_asset_references WHERE campaign_id = ?', [campaignId])
    })
  }

  private async initializeInternal(): Promise<void> {
    await mkdir(path.dirname(this.databaseFilePath), { recursive: true })
    const SQL = await sqlJsPromise
    let existingBytes: Uint8Array | undefined

    try {
      existingBytes = await readFile(this.databaseFilePath)
    } catch (error) {
      if (!isNodeError(error, 'ENOENT')) {
        throw error
      }
    }

    this.database = existingBytes ? new SQL.Database(existingBytes) : new SQL.Database()
    await migrateAssetCatalog(this)
    await this.persist()
  }

  private async waitUntilReadable(): Promise<void> {
    await this.initialize()
    await this.writeQueue
  }

  private enqueueWrite<Result>(operation: () => Result): Promise<Result> {
    const queuedOperation = this.writeQueue.then(async () => {
      const database = this.requireDatabase()
      database.run('BEGIN IMMEDIATE')
      try {
        const result = operation()
        database.run('COMMIT')
        await this.persist()
        return result
      } catch (error) {
        try {
          database.run('ROLLBACK')
        } catch {
          // The transaction may already be committed when writing the database file fails.
        }
        throw error
      }
    })

    this.writeQueue = queuedOperation.then(
      () => undefined,
      () => undefined,
    )
    return queuedOperation
  }

  private async persist(): Promise<void> {
    const temporaryPath = `${this.databaseFilePath}.tmp`
    const databaseBytes = this.requireDatabase().export()
    this.registerFunctions()
    await writeFile(temporaryPath, databaseBytes)
    try {
      await rename(temporaryPath, this.databaseFilePath)
    } catch (error) {
      if (!isNodeError(error, 'EEXIST') && !isNodeError(error, 'EPERM')) {
        throw error
      }
      await rm(this.databaseFilePath, { force: true })
      await rename(temporaryPath, this.databaseFilePath)
    }
  }

  private requireDatabase(): Database {
    if (!this.database) {
      throw new Error('Asset catalog is not initialized')
    }
    return this.database
  }

  private registerFunctions(): void {
    this.requireDatabase().create_function('unicode_lower', (value: unknown) =>
      typeof value === 'string' ? value.toLocaleLowerCase('ru') : value,
    )
  }

  private queryRows(sql: string, parameters?: BindParams): ParamsObject[] {
    const statement = this.requireDatabase().prepare(sql, parameters)
    const rows: ParamsObject[] = []
    try {
      while (statement.step()) {
        rows.push(statement.getAsObject())
      }
    } finally {
      statement.free()
    }
    return rows
  }

  private queryOne<T>(sql: string, parameters: BindParams, map: (row: ParamsObject) => T): T | null {
    const row = this.queryRows(sql, parameters)[0]
    return row ? map(row) : null
  }

  private getAssetByWhereClause(whereClause: string, parameters: BindParams): IndexedAsset | null {
    const asset = this.queryOne(`SELECT * FROM indexed_assets WHERE ${whereClause}`, parameters, mapAsset)
    return asset ? this.attachTags([asset])[0] ?? null : null
  }

  private attachTags(assets: IndexedAsset[]): IndexedAsset[] {
    return assets.map((asset) => ({
      ...asset,
      tags: this.queryRows(
        'SELECT tag FROM indexed_asset_tags WHERE asset_id = ? ORDER BY tag COLLATE NOCASE',
        [asset.id],
      ).map((row) => readString(row, 'tag')),
    }))
  }
}

function mapSource(row: ParamsObject): AssetLibrarySource {
  return {
    id: readString(row, 'id'),
    rootPath: readString(row, 'root_path'),
    displayName: readString(row, 'display_name'),
    status: readString(row, 'status') as AssetLibrarySource['status'],
    createdAt: readString(row, 'created_at'),
    updatedAt: readString(row, 'updated_at'),
    ...optionalStringProperty(row, 'last_scan_started_at', 'lastScanStartedAt'),
    ...optionalStringProperty(row, 'last_scan_completed_at', 'lastScanCompletedAt'),
    ...optionalStringProperty(row, 'last_error', 'lastError'),
  }
}

function mapAsset(row: ParamsObject): IndexedAsset {
  return {
    id: readString(row, 'id'),
    sourceId: readString(row, 'source_id'),
    canonicalPath: readString(row, 'canonical_path'),
    relativePath: readString(row, 'relative_path'),
    fileName: readString(row, 'file_name'),
    byteSize: readNumber(row, 'byte_size'),
    modifiedAt: readString(row, 'modified_at'),
    kind: readString(row, 'kind') as IndexedAsset['kind'],
    mimeType: readString(row, 'mime_type'),
    format: readString(row, 'format'),
    width: readNumber(row, 'width'),
    height: readNumber(row, 'height'),
    ...optionalStringProperty(row, 'sha256', 'sha256'),
    ...optionalStringProperty(row, 'preview_path', 'previewPath'),
    tags: [],
    availability: readString(row, 'availability') as IndexedAsset['availability'],
    indexedAt: readString(row, 'indexed_at'),
  }
}

function mapManagedBlob(row: ParamsObject): ManagedAssetBlob {
  return {
    sha256: readString(row, 'sha256'),
    relativePath: readString(row, 'relative_path'),
    byteSize: readNumber(row, 'byte_size'),
    mimeType: readString(row, 'mime_type'),
    fileExtension: readString(row, 'file_extension'),
    createdAt: readString(row, 'created_at'),
    ...optionalStringProperty(row, 'verified_at', 'verifiedAt'),
  }
}

function saveCampaignBinding(database: Database, binding: CampaignAssetBinding): void {
  const storage = binding.storage
  const sha256 = storage.kind === 'managed' ? storage.sha256 : null
  const indexedAssetId = storage.kind === 'embedded-data' ? null : storage.indexedAssetId ?? null
  const legacyFileUrl = storage.kind === 'legacy-file' ? storage.fileUrl : null

  database.run(
    `INSERT INTO campaign_asset_references (
      campaign_id, asset_id, storage_kind, sha256, indexed_asset_id,
      legacy_file_url, export_policy, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(campaign_id, asset_id) DO UPDATE SET
      storage_kind = excluded.storage_kind,
      sha256 = excluded.sha256,
      indexed_asset_id = excluded.indexed_asset_id,
      legacy_file_url = excluded.legacy_file_url,
      export_policy = excluded.export_policy,
      updated_at = excluded.updated_at`,
    [
      binding.campaignId,
      binding.assetId,
      storage.kind,
      sha256,
      indexedAssetId,
      legacyFileUrl,
      binding.exportPolicy,
      binding.createdAt,
      binding.updatedAt,
    ],
  )
}

function appendInFilter(
  clauses: string[],
  parameters: SqlValue[],
  column: string,
  values: readonly string[] | undefined,
): void {
  if (!values || values.length === 0) {
    return
  }
  clauses.push(`${column} IN (${values.map(() => '?').join(', ')})`)
  parameters.push(...values)
}

function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function escapeLikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}

function readString(row: ParamsObject, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') {
    throw new Error(`Invalid SQLite text value in ${key}`)
  }
  return value
}

function readNumber(row: ParamsObject | undefined, key: string): number {
  const value = row?.[key]
  if (typeof value !== 'number') {
    throw new Error(`Invalid SQLite numeric value in ${key}`)
  }
  return value
}

function optionalStringProperty<PropertyName extends string>(
  row: ParamsObject,
  key: string,
  propertyName: PropertyName,
): { [Key in PropertyName]?: string } {
  const value = row[key]
  return typeof value === 'string' ? ({ [propertyName]: value } as { [Key in PropertyName]?: string }) : {}
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === code
}
