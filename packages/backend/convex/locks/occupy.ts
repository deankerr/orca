import { ConvexError, v } from 'convex/values'

import { internalMutation } from '../_generated/server'
import type { MutationCtx } from '../_generated/server'
import { LOCKS_TABLE } from './table'

export const LOCK_HELD = 'lock already held'

/**
 * Insert a row for `key`, then `.unique()` that key.
 *
 * One row: this mutation holds the lock. More than one: `.unique()` throws,
 * this mutation throws, the insert rolls back.
 *
 * @throws {ConvexError} If `key` is already held.
 */
export async function occupy(ctx: MutationCtx, key: string): Promise<void> {
  await ctx.db.insert(LOCKS_TABLE, { key })
  try {
    await ctx.db
      .query(LOCKS_TABLE)
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique()
  } catch {
    throw new ConvexError({ message: LOCK_HELD, key })
  }
}

/**
 * Savepoint for `tryClaim`. Callers use `tryClaim`, not this mutation.
 *
 * @throws {ConvexError} If `key` is already held.
 */
export const run = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await occupy(ctx, args.key)
    return null
  },
})
