import { describe, expect, it } from 'vitest'
import {
  ASSET_CATALOG_SCHEMA_VERSION,
  migrateAssetCatalog,
  type AssetCatalogMigrationDatabase,
} from './assetCatalogMigrations.js'

describe('asset catalog migrations', () => {
  it('applies every migration in its own transaction on a fresh catalog', async () => {
    const database = new FakeMigrationDatabase(0)

    await expect(migrateAssetCatalog(database)).resolves.toEqual({
      previousVersion: 0,
      currentVersion: ASSET_CATALOG_SCHEMA_VERSION,
      appliedVersions: [1, 2],
    })
    expect(database.version).toBe(ASSET_CATALOG_SCHEMA_VERSION)
    expect(database.statements.filter((statement) => statement === 'BEGIN IMMEDIATE')).toHaveLength(2)
    expect(database.statements.filter((statement) => statement === 'COMMIT')).toHaveLength(2)
    expect(database.statements.some((statement) => statement.includes('CREATE TABLE indexed_assets'))).toBe(true)
    expect(database.statements.some((statement) => statement.includes('CREATE TABLE managed_asset_blobs'))).toBe(true)
    expect(database.statements.some((statement) => statement.includes('CREATE TABLE campaign_asset_references'))).toBe(
      true,
    )
  })

  it('only applies migrations newer than the current user version', async () => {
    const database = new FakeMigrationDatabase(1)

    await expect(migrateAssetCatalog(database)).resolves.toEqual({
      previousVersion: 1,
      currentVersion: 2,
      appliedVersions: [2],
    })
    expect(database.statements.some((statement) => statement.includes('CREATE TABLE asset_library_sources'))).toBe(
      false,
    )
  })

  it('rolls back a failed migration without advancing the schema version', async () => {
    const database = new FakeMigrationDatabase(1, 'CREATE TABLE managed_asset_blobs')

    await expect(migrateAssetCatalog(database)).rejects.toThrow('Injected migration failure')
    expect(database.version).toBe(1)
    expect(database.statements.at(-1)).toBe('ROLLBACK')
  })

  it('refuses to open a catalog created by a newer application version', async () => {
    const database = new FakeMigrationDatabase(ASSET_CATALOG_SCHEMA_VERSION + 1)

    await expect(migrateAssetCatalog(database)).rejects.toThrow('is newer than supported version')
    expect(database.statements).toEqual(['PRAGMA foreign_keys = ON'])
  })
})

class FakeMigrationDatabase implements AssetCatalogMigrationDatabase {
  readonly statements: string[] = []
  private transactionStartVersion: number | null = null

  constructor(
    public version: number,
    private readonly failOnStatement?: string,
  ) {}

  async getUserVersion(): Promise<number> {
    return this.version
  }

  async exec(statement: string): Promise<void> {
    this.statements.push(statement)

    if (this.failOnStatement && statement.includes(this.failOnStatement)) {
      throw new Error('Injected migration failure')
    }

    if (statement === 'BEGIN IMMEDIATE') {
      this.transactionStartVersion = this.version
      return
    }

    if (statement === 'ROLLBACK') {
      this.version = this.transactionStartVersion ?? this.version
      this.transactionStartVersion = null
      return
    }

    if (statement === 'COMMIT') {
      this.transactionStartVersion = null
      return
    }

    const versionMatch = /^PRAGMA user_version = (\d+)$/.exec(statement)

    if (versionMatch?.[1]) {
      this.version = Number(versionMatch[1])
    }
  }
}
