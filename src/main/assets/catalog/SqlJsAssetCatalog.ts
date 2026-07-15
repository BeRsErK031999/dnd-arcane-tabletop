import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs, { type BindParams, type Database, type ParamsObject, type SqlValue } from 'sql.js'
import type {
  AssetLibrarySource,
  AssetLibrarySourceId,
  IndexedAsset,
  IndexedAssetId,
  Sha256Digest,
} from '../../../shared/types/index.js'
import type { AssetIndexService, IndexedAssetPage, IndexedAssetQuery } from '../hybridStorageContracts.js'
import {
  migrateAssetCatalog,
  type AssetCatalogMigrationDatabase,
} from './assetCatalogMigrations.js'

const require = createRequire(import.meta.url)
const sqlJsWasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
const sqlJsPromise = initSqlJs({
  locateFile: () => sqlJsWasmPath,
})

export class SqlJsAssetCatalog implements AssetIndexService, AssetCatalogMigrationDatabase {
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
      clauses.push('(indexed_assets.file_name LIKE ? ESCAPE \'\\\' OR indexed_assets.relative_path LIKE ? ESCAPE \'\\\')')
      const pattern = `%${escapeLikePattern(search)}%`
      parameters.push(pattern, pattern)
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
    const limit = Math.max(1, Math.min(500, Math.trunc(query.limit)))
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

  private enqueueWrite(operation: () => void): Promise<void> {
    const queuedOperation = this.writeQueue.then(async () => {
      const database = this.requireDatabase()
      database.run('BEGIN IMMEDIATE')
      try {
        operation()
        database.run('COMMIT')
        await this.persist()
      } catch (error) {
        try {
          database.run('ROLLBACK')
        } catch {
          // The transaction may already be committed when writing the database file fails.
        }
        throw error
      }
    })

    this.writeQueue = queuedOperation.catch(() => undefined)
    return queuedOperation
  }

  private async persist(): Promise<void> {
    const temporaryPath = `${this.databaseFilePath}.tmp`
    await writeFile(temporaryPath, this.requireDatabase().export())
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
