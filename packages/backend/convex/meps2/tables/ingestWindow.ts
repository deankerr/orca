import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * One ingested interval per `path`. Absent row means nothing ingested.
 *
 * The ingested set is registered rows with `earliest_scan_at ≤ scan_at ≤ latest_scan_at`.
 */
export const ingestWindowTable = defineTable({
  /** Timeline. Scan artifacts use `scan`. */
  path: v.string(),
  /** Inclusive lower bound of the ingested interval. */
  earliest_scan_at: v.string(),
  /** Inclusive upper bound of the ingested interval. */
  latest_scan_at: v.string(),
}).index('by_path', ['path'])
