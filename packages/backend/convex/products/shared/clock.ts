import { v } from 'convex/values'

import { query } from '#generated/server'
import type { QueryCtx } from '#generated/server'

import { REGISTRATIONS_TABLE } from '../../ingestion/table'

/** Product observation clock: latest completed scan time, or null before the first ingestion. */
export async function clock(ctx: QueryCtx): Promise<string | null> {
  const latest = await ctx.db
    .query(REGISTRATIONS_TABLE)
    .withIndex('by_progress_kind_and_scan_at', (q) => q.eq('progress.kind', 'complete'))
    .order('desc')
    .first()
  return latest?.scan_at ?? null
}

/** Product horizon, subscribed separately so advancing time does not invalidate history pages. */
export const observe = query({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: clock,
})
