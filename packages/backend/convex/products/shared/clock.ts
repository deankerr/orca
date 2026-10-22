import { v } from 'convex/values'

import { query } from '#generated/server'
import type { QueryCtx } from '#generated/server'

import { INGESTION_RECORDS_TABLE } from '../../ingestion/tables'

/**
 * Latest scan with committed output. Backfill and forward work complete independently,
 * so earlier scans may still be in progress; readers tolerate that.
 */
export async function clock(ctx: QueryCtx): Promise<string | null> {
  const latest = await Promise.all(
    (['pair', 'baseline'] as const).map(
      async (kind) =>
        await ctx.db
          .query(INGESTION_RECORDS_TABLE)
          .withIndex('by_kind_and_state_and_scan_at', (q) =>
            q.eq('kind', kind).eq('state', 'complete'),
          )
          .order('desc')
          .first(),
    ),
  )

  return (
    latest
      .flatMap((record) => (record === null ? [] : [record.scan_at]))
      .toSorted()
      .at(-1) ?? null
  )
}

/** Product horizon, subscribed separately so advancing time does not invalidate history pages. */
export const observe = query({
  args: {},
  handler: clock,
  returns: v.union(v.null(), v.string()),
})
