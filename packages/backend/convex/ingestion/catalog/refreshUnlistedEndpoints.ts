import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import * as R from 'remeda'

import { internal } from '#generated/api'
import { internalAction, internalMutation, internalQuery } from '#generated/server'
import * as scans from '#scans'
import type { Scan } from '#scans/extraction'

import { CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from '../../catalog/tables/current'
import { endpointRow } from '../operators/currentEndpoints'

const unlistedRow = v.object({
  _id: v.id(CURRENT_ENDPOINTS_TABLE),
  endpoint_id: v.string(),
  unlisted_at: v.string(),
})

type UnlistedRow = Infer<typeof unlistedRow>

const restatement = v.object({ _id: unlistedRow.fields._id, row: currentEndpointsTable.validator })

type Restatement = Infer<typeof restatement>

const refreshResult = v.object({
  missing: v.array(v.string()),
  read: v.number(),
  restated: v.number(),
})

export const unlistedRows = internalQuery({
  args: { atOrAfter: v.string() },
  handler: async (ctx, { atOrAfter }) => {
    const rows = await ctx.db
      .query(CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_unlisted_at', (q) => q.gte('unlisted_at', atOrAfter))
      .collect()

    return rows.flatMap(({ _id, endpoint_id, unlisted_at }) =>
      unlisted_at === undefined ? [] : [{ _id, endpoint_id, unlisted_at }],
    )
  },
  returns: v.array(unlistedRow),
})

/** Rows relisted or unlisted again since the read were written under the current policy; skip them. */
export const restate = internalMutation({
  args: { restatements: v.array(restatement) },
  handler: async (ctx, { restatements }) => {
    let restated = 0

    for (const { _id, row } of restatements) {
      const retained = await ctx.db.get(CURRENT_ENDPOINTS_TABLE, _id)

      if (retained?.unlisted_at === row.unlisted_at) {
        await ctx.db.replace(CURRENT_ENDPOINTS_TABLE, _id, row)
        restated += 1
      }
    }

    return restated
  },
  returns: v.number(),
})

/** Departure rows as ingestion now derives them from the scan before their unlisting. */
function restateFrom(source: Scan | null, rows: UnlistedRow[]) {
  const restatements: Restatement[] = []
  const missing: string[] = []

  for (const { _id, endpoint_id, unlisted_at } of rows) {
    const endpoint = source?.endpoints.get(endpoint_id)

    if (endpoint === undefined) {
      missing.push(endpoint_id)
    } else {
      restatements.push({ _id, row: endpointRow(endpoint, { scan_at: unlisted_at, unlisted_at }) })
    }
  }

  return { missing, restatements }
}

/**
 * Restate unlisted rows under the current metadata selection, newest unlisting first.
 * Ingestion never rewrites an unlisted row, so selection changes reach existing unlistings only here.
 */
export const run = internalAction({
  args: { atOrAfter: v.string() },
  handler: async (ctx, { atOrAfter }): Promise<Infer<typeof refreshResult>> => {
    const rows: UnlistedRow[] = await ctx.runQuery(
      internal.ingestion.catalog.refreshUnlistedEndpoints.unlistedRows,
      { atOrAfter },
    )

    const unlistings = R.groupBy(rows, R.prop('unlisted_at'))
    const missing: string[] = []
    let restated = 0

    for (const unlistedAt of Object.keys(unlistings).toSorted().toReversed()) {
      const [sourceAt] = await scans.times(ctx, { before: unlistedAt, limit: 1, order: 'desc' })
      const source = sourceAt === undefined ? null : await scans.load(ctx, sourceAt)
      const group = restateFrom(source, unlistings[unlistedAt] ?? [])

      missing.push(...group.missing)
      restated += await ctx.runMutation(
        internal.ingestion.catalog.refreshUnlistedEndpoints.restate,
        { restatements: group.restatements },
      )
    }

    return { missing, read: rows.length, restated }
  },
  returns: refreshResult,
})
