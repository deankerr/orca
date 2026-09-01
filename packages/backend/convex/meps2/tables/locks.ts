import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Presence of a row is the lock. Callers choose `key`; this table does not
 * interpret it.
 */
export const locksTable = defineTable({
  /** Occupancy key chosen by the caller (`observe`, `drain:${path}`). */
  key: v.string(),
}).index('by_key', ['key'])
