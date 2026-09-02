/**
 * Occupancy for a caller-chosen key.
 *
 * Import `claim` / `tryClaim` / `release` from this module. Presence of a row
 * is the lock. Uniqueness and the extra-row rollback stay inside.
 */
import { ConvexError } from 'convex/values'

import { internal } from '../_generated/api'
import type { MutationCtx } from '../_generated/server'
import { LOCK_HELD, occupy } from './occupy'
import { LOCKS_TABLE } from './table'

/**
 * Take occupancy of `key` in this mutation, or throw.
 *
 * @throws {ConvexError} If `key` is already held.
 */
export async function claim(ctx: MutationCtx, key: string): Promise<void> {
  await occupy(ctx, key)
}

/**
 * Take occupancy of `key`, or return false if it is already held.
 *
 * Held does not fail this mutation. Use `claim` when held should abort.
 */
export async function tryClaim(ctx: MutationCtx, key: string): Promise<boolean> {
  const existing = await ctx.db
    .query(LOCKS_TABLE)
    .withIndex('by_key', (q) => q.eq('key', key))
    .first()

  if (existing !== null) {
    return false
  }

  try {
    await ctx.runMutation(internal.locks.occupy.run, { key })
    return true
  } catch (error: unknown) {
    if (isLockHeldError(error)) {
      return false
    }

    throw error
  }
}

/**
 * Drop occupancy of `key`. Missing key is a no-op.
 */
export async function release(ctx: MutationCtx, key: string): Promise<void> {
  const rows = await ctx.db
    .query(LOCKS_TABLE)
    .withIndex('by_key', (q) => q.eq('key', key))
    .collect()

  for (const row of rows) {
    await ctx.db.delete(row._id)
  }
}

/**
 * True when `claim` failed because `key` was already held.
 */
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
