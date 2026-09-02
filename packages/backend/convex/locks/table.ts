import { defineTable } from 'convex/server'
import { v } from 'convex/values'

/** Occupancy table. Schema imports this. */
export const LOCKS_TABLE = 'locks' as const

/**
 * Presence of a row is occupancy. Callers choose `key`; this table does not
 * interpret it.
 */
export const locksTable = defineTable({
  /** Occupancy key chosen by the caller. Opaque. */
  key: v.string(),
}).index('by_key', ['key'])
