import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/** Catalog table for stored objects. Schema and the storage sweep import this. */
export const OBJECTS_LOCATORS_TABLE = 'objects_locators' as const

const locatorBase = {
  /** Grouping prefix. Opaque; an object-storage backend uses this as the key prefix. */
  path: v.string(),
  /** Object name within `path`. Opaque; not parsed. */
  name: v.string(),
  /** How the blob is encoded. Load switches on this. */
  codec: v.literal('gzip'),
  /** Uncompressed UTF-8 byte length. */
  size: v.number(),
}

/**
 * One locator: the catalog row for a stored object.
 *
 * Identity is `(path, name)`. Backend, codec, and the backend locator are
 * private to this module.
 */
export const locatorsTable = defineTable(
  v.union(
    v.object({
      ...locatorBase,
      backend: v.literal('convex'),
      /** Convex file-storage id of the compressed blob. */
      storage_id: v.id('_storage'),
    }),
    v.object({
      ...locatorBase,
      backend: v.literal('r2'),
      /** R2 object key of the compressed blob. */
      r2_key: v.string(),
    }),
  ),
)
  .index('by_path_name', ['path', 'name'])
  .index('by_path', ['path'])
  .index('by_backend', ['backend'])

/** Catalog row for a stored object. Not part of `store` / `load`. */
export type Locator = Infer<typeof locatorsTable.validator>
