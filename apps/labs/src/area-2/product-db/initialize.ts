import type { Database } from 'bun:sqlite'

import { PRODUCT_DATABASE_SCHEMA_STATEMENTS } from './schema.ts'

// Bump this when persisted schema, materialization, selection, or diff policy changes.
export const PRODUCT_DATABASE_VERSION = 'area-2-v4-text-only-first-daily'

export interface ProductPolicies {
  outputModalities: 'text-only'
  sampleRate: 'all' | 'daily'
}

// This experiment's projection declaration is stored as metadata, not enforced on applied crawls.
export const PRODUCT_POLICIES = {
  outputModalities: 'text-only',
  sampleRate: 'daily',
} satisfies ProductPolicies

/** Initializes or validates the compact current-state and changeset Area 2 database. */
export const initializeProductDatabase = (database: Database) => {
  for (const statement of PRODUCT_DATABASE_SCHEMA_STATEMENTS) {
    database.run(statement)
  }

  const schemaVersion = database
    .query<{ value: string }, [string]>('SELECT value FROM database_metadata WHERE key = ?')
    .get('schema_version')
  if (schemaVersion === null) {
    const insertMetadata = database.query(
      'INSERT INTO database_metadata (key, value) VALUES (?, ?)',
    )
    insertMetadata.run('schema_version', PRODUCT_DATABASE_VERSION)
    insertMetadata.run('policies', JSON.stringify(PRODUCT_POLICIES))
    return
  }
  if (schemaVersion.value !== PRODUCT_DATABASE_VERSION) {
    throw new Error(
      `unsupported product database version ${schemaVersion.value}; expected ${PRODUCT_DATABASE_VERSION}`,
    )
  }

  const policies = database
    .query<{ value: string }, [string]>('SELECT value FROM database_metadata WHERE key = ?')
    .get('policies')
  const expectedPolicies = JSON.stringify(PRODUCT_POLICIES)
  if (policies === null || policies.value !== expectedPolicies) {
    throw new Error(
      `unsupported product database policies ${policies?.value ?? 'missing'}; expected ${expectedPolicies}`,
    )
  }
}
