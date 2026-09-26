import { v } from 'convex/values'

import { internalQuery } from '../_generated/server'
import type { QueryCtx } from '../_generated/server'
import { V4_INGESTIONS_TABLE } from './ingestion/table'

/** Shared observation clock: latest ingested scan time, or null before the first ingestion. */
export async function clock(ctx: QueryCtx): Promise<string | null> {
  const latest = await ctx.db
    .query(V4_INGESTIONS_TABLE)
    .withIndex('by_scan_at')
    .order('desc')
    .first()
  return latest?.scan_at ?? null
}

/** Action/operator access to the same observation clock used by queries and mutations. */
export const get = internalQuery({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: clock,
})
