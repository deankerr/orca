import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Insert-only order log of registered scan artifacts.
 *
 * Not the blob locator. `artifact_id` is an opaque pointer for `objects.load`.
 */
export const scansTable = defineTable({
  /** Timeline. Scan artifacts use `scan`. */
  path: v.string(),
  /** Domain identity and apply order. ISO UTC. */
  scan_at: v.string(),
  /** Opaque object name within `path`. */
  artifact_id: v.string(),
})
  .index('by_path_scan_at', ['path', 'scan_at'])
  .index('by_path_artifact_id', ['path', 'artifact_id'])
