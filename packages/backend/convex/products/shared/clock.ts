import { v } from 'convex/values'

import { query } from '#generated/server'
import type { QueryCtx } from '#generated/server'

import { incompletePairStates, SCAN_PAIRS_TABLE } from '../../ingestion/tables'

/** End of the complete prefix of registered pairs. */
export async function clock(ctx: QueryCtx): Promise<string | null> {
  const incomplete = await Promise.all(
    incompletePairStates.map(
      async (state) =>
        await ctx.db
          .query(SCAN_PAIRS_TABLE)
          .withIndex('by_state_and_scan_at', (q) => q.eq('state', state))
          .first(),
    ),
  )
  const [first] = incomplete
    .filter((pair) => pair !== null)
    .toSorted((a, b) => a.scan_at.localeCompare(b.scan_at))

  if (first !== undefined) {
    return first.from_scan_at
  }

  const latest = await ctx.db.query(SCAN_PAIRS_TABLE).withIndex('by_scan_at').order('desc').first()
  return latest?.scan_at ?? null
}

/** Product horizon, subscribed separately so advancing time does not invalidate history pages. */
export const observe = query({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: clock,
})
