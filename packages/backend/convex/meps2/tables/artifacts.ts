import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Convex locator table for stored artifacts.
 *
 * Callers of `store` / `load` do not read this table. `storage_id` is a backend
 * locator, not an artifact id.
 */
export const artifactsTable = defineTable({
  /** Grouping prefix. Opaque; an object-storage backend uses this as the key prefix. */
  path: v.string(),
  /** Object name within `path`. Opaque; not parsed. */
  artifact_id: v.string(),

  /** Convex file-storage id of the compressed blob. */
  storage_id: v.id('_storage'),
  size: v.object({
    /** Uncompressed byte length. */
    raw: v.number(),
    /** Stored blob length after the backend codec. */
    blob: v.number(),
  }),
})
  .index('by_path_artifact_id', ['path', 'artifact_id'])
  .index('by_path', ['path'])
