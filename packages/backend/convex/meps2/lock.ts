import { ConvexError, v } from 'convex/values'

import { internalMutation } from '../_generated/server'

const LOCK_HELD = 'lock already held'

/**
 * Insert a row for `key`, then `.unique()` that key.
 *
 * One row: this mutation holds the lock. More than one: `.unique()` throws,
 * this mutation throws, the insert rolls back.
 *
 * @throws {ConvexError} If `key` is already held.
 */
export const claim = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.db.insert('meps2_locks', { key: args.key })
    try {
      await ctx.db
        .query('meps2_locks')
        .withIndex('by_key', (q) => q.eq('key', args.key))
        .unique()
    } catch {
      throw new ConvexError({ message: LOCK_HELD, key: args.key })
    }
    return null
  },
})

/**
 * Delete the row for `key`. Missing key is a no-op.
 */
export const release = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db
      .query('meps2_locks')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .unique()
    if (row !== null) {
      await ctx.db.delete(row._id)
    }
    return null
  },
})

export function isLockHeldError(error: unknown) {
  if (!(error instanceof ConvexError)) {
    return false
  }
  const data: unknown = error.data
  if (typeof data !== 'object' || data === null || !('message' in data)) {
    return false
  }
  return data.message === LOCK_HELD
}
