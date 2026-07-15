export interface AssetCatalogMigration {
  version: number
  name: string
  statements: readonly string[]
}

export interface AssetCatalogMigrationDatabase {
  getUserVersion(): Promise<number>
  exec(statement: string): Promise<void>
}

export interface AssetCatalogMigrationResult {
  previousVersion: number
  currentVersion: number
  appliedVersions: number[]
}

export const ASSET_CATALOG_MIGRATIONS: readonly AssetCatalogMigration[] = [
  {
    version: 1,
    name: 'create_indexed_asset_catalog',
    statements: [
      `CREATE TABLE asset_catalog_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      ) STRICT`,
      `CREATE TABLE asset_library_sources (
        id TEXT PRIMARY KEY,
        root_path TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('idle', 'indexing', 'ready', 'unavailable', 'error')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_scan_started_at TEXT,
        last_scan_completed_at TEXT,
        last_error TEXT
      ) STRICT`,
      `CREATE TABLE indexed_assets (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL REFERENCES asset_library_sources(id) ON DELETE CASCADE,
        canonical_path TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
        modified_at TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('map', 'token', 'portrait', 'handout', 'other')),
        mime_type TEXT NOT NULL,
        format TEXT NOT NULL,
        width INTEGER NOT NULL CHECK (width >= 0),
        height INTEGER NOT NULL CHECK (height >= 0),
        sha256 TEXT CHECK (
          sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*')
        ),
        preview_path TEXT,
        availability TEXT NOT NULL CHECK (availability IN ('available', 'missing', 'unreadable')),
        indexed_at TEXT NOT NULL,
        UNIQUE (source_id, canonical_path)
      ) STRICT`,
      `CREATE TABLE indexed_asset_tags (
        asset_id TEXT NOT NULL REFERENCES indexed_assets(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (asset_id, tag)
      ) STRICT, WITHOUT ROWID`,
      'CREATE INDEX indexed_assets_source_relative_path_idx ON indexed_assets(source_id, relative_path)',
      'CREATE INDEX indexed_assets_sha256_idx ON indexed_assets(sha256) WHERE sha256 IS NOT NULL',
      'CREATE INDEX indexed_assets_availability_idx ON indexed_assets(availability)',
      'CREATE INDEX indexed_asset_tags_tag_idx ON indexed_asset_tags(tag)',
    ],
  },
  {
    version: 2,
    name: 'create_managed_blobs_and_campaign_bindings',
    statements: [
      `CREATE TABLE managed_asset_blobs (
        sha256 TEXT PRIMARY KEY CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
        relative_path TEXT NOT NULL UNIQUE,
        byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
        mime_type TEXT NOT NULL,
        file_extension TEXT NOT NULL,
        created_at TEXT NOT NULL,
        verified_at TEXT
      ) STRICT`,
      `CREATE TABLE campaign_asset_references (
        campaign_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        storage_kind TEXT NOT NULL CHECK (storage_kind IN ('managed', 'legacy-file', 'embedded-data')),
        sha256 TEXT REFERENCES managed_asset_blobs(sha256) ON DELETE RESTRICT,
        indexed_asset_id TEXT REFERENCES indexed_assets(id) ON DELETE SET NULL,
        legacy_file_url TEXT,
        export_policy TEXT NOT NULL CHECK (export_policy IN ('when-used', 'always')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (campaign_id, asset_id),
        CHECK (
          (storage_kind = 'managed' AND sha256 IS NOT NULL AND legacy_file_url IS NULL) OR
          (storage_kind = 'legacy-file' AND legacy_file_url IS NOT NULL) OR
          (storage_kind = 'embedded-data' AND sha256 IS NULL AND legacy_file_url IS NULL)
        )
      ) STRICT, WITHOUT ROWID`,
      'CREATE INDEX campaign_asset_references_sha256_idx ON campaign_asset_references(sha256) WHERE sha256 IS NOT NULL',
      'CREATE INDEX campaign_asset_references_indexed_asset_idx ON campaign_asset_references(indexed_asset_id) WHERE indexed_asset_id IS NOT NULL',
      'CREATE INDEX campaign_asset_references_export_policy_idx ON campaign_asset_references(campaign_id, export_policy)',
    ],
  },
  {
    version: 3,
    name: 'track_incremental_asset_scans',
    statements: [
      'ALTER TABLE indexed_assets ADD COLUMN last_seen_scan_id TEXT',
      'CREATE INDEX indexed_assets_last_seen_scan_idx ON indexed_assets(source_id, last_seen_scan_id)',
    ],
  },
]

export const ASSET_CATALOG_SCHEMA_VERSION = ASSET_CATALOG_MIGRATIONS.at(-1)?.version ?? 0

export async function migrateAssetCatalog(
  database: AssetCatalogMigrationDatabase,
): Promise<AssetCatalogMigrationResult> {
  await database.exec('PRAGMA foreign_keys = ON')

  const previousVersion = await database.getUserVersion()

  if (!Number.isSafeInteger(previousVersion) || previousVersion < 0) {
    throw new Error(`Invalid asset catalog schema version: ${previousVersion}`)
  }

  if (previousVersion > ASSET_CATALOG_SCHEMA_VERSION) {
    throw new Error(
      `Asset catalog schema version ${previousVersion} is newer than supported version ${ASSET_CATALOG_SCHEMA_VERSION}`,
    )
  }

  const pendingMigrations = ASSET_CATALOG_MIGRATIONS.filter(
    (migration) => migration.version > previousVersion,
  )
  const appliedVersions: number[] = []

  for (const migration of pendingMigrations) {
    await applyMigration(database, migration)
    appliedVersions.push(migration.version)
  }

  return {
    previousVersion,
    currentVersion: appliedVersions.at(-1) ?? previousVersion,
    appliedVersions,
  }
}

async function applyMigration(
  database: AssetCatalogMigrationDatabase,
  migration: AssetCatalogMigration,
): Promise<void> {
  await database.exec('BEGIN IMMEDIATE')

  try {
    for (const statement of migration.statements) {
      await database.exec(statement)
    }

    await database.exec(
      `INSERT INTO asset_catalog_migrations (version, name, applied_at) VALUES (${migration.version}, ${quoteSqlLiteral(migration.name)}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    )
    await database.exec(`PRAGMA user_version = ${migration.version}`)
    await database.exec('COMMIT')
  } catch (error) {
    await database.exec('ROLLBACK').catch(() => undefined)
    throw error
  }
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
