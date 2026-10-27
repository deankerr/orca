import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import * as R from 'remeda'

import { internal } from '#generated/api'
import { internalAction, internalMutation, internalQuery } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import * as scans from '#scans'
import type { Scan } from '#scans/extraction'

import { CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from '../../catalog/tables/current'
import { endpointRow } from '../operators/currentEndpoints'

/** Unlisted rows per page; one page bounds each read, restate mutation, and scheduled step. */
const PAGE_SIZE = 100

const unlistedRow = v.object({
  _id: v.id(CURRENT_ENDPOINTS_TABLE),
  endpoint_id: v.string(),
  unlisted_at: v.string(),
})

type UnlistedRow = Infer<typeof unlistedRow>

const restatement = v.object({ _id: unlistedRow.fields._id, row: currentEndpointsTable.validator })

type Restatement = Infer<typeof restatement>

const progress = v.object({ missing: v.array(v.string()), read: v.number(), restated: v.number() })

/** Newest unlistings first, so the grid's window changes from its most recent unlistings. */
export const unlistedPage = internalQuery({
  args: { atOrAfter: v.string(), cursor: v.union(v.null(), v.string()) },
  handler: async (ctx, { atOrAfter, cursor }) => {
    const { page, continueCursor, isDone } = await ctx.db
      .query(CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_unlisted_at', (q) => q.gte('unlisted_at', atOrAfter))
      .order('desc')
      .paginate({ cursor, numItems: PAGE_SIZE })

    return {
      continueCursor,
      isDone,
      rows: page.flatMap(({ _id, endpoint_id, unlisted_at }) =>
        unlisted_at === undefined ? [] : [{ _id, endpoint_id, unlisted_at }],
      ),
    }
  },
  returns: v.object({
    continueCursor: v.string(),
    isDone: v.boolean(),
    rows: v.array(unlistedRow),
  }),
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

/** The scan before an unlisting holds the last-known facts ingestion derived its departure from. */
async function departureSource(ctx: ActionCtx, unlistedAt: string): Promise<Scan | null> {
  const [sourceAt] = await scans.times(ctx, { before: unlistedAt, limit: 1, order: 'desc' })

  return sourceAt === undefined ? null : await scans.load(ctx, sourceAt)
}

/** Departure rows as ingestion now derives them from their source scan. */
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

/** One bounded page of the refresh; schedules the next until the range is exhausted. */
export const refreshPage = internalAction({
  args: { atOrAfter: v.string(), cursor: v.union(v.null(), v.string()), progress },
  handler: async (ctx, { atOrAfter, cursor, progress: before }) => {
    const page = await ctx.runQuery(
      internal.ingestion.catalog.refreshUnlistedEndpoints.unlistedPage,
      {
        atOrAfter,
        cursor,
      },
    )

    const missing = [...before.missing]
    let { restated } = before

    for (const [unlistedAt, rows] of Object.entries(R.groupBy(page.rows, R.prop('unlisted_at')))) {
      const group = restateFrom(await departureSource(ctx, unlistedAt), rows)

      missing.push(...group.missing)
      restated += await ctx.runMutation(
        internal.ingestion.catalog.refreshUnlistedEndpoints.restate,
        { restatements: group.restatements },
      )
    }

    const after = { missing, read: before.read + page.rows.length, restated }

    if (page.isDone) {
      console.log('Refreshed unlisted endpoints', after)
    } else {
      await ctx.scheduler.runAfter(
        0,
        internal.ingestion.catalog.refreshUnlistedEndpoints.refreshPage,
        {
          atOrAfter,
          cursor: page.continueCursor,
          progress: after,
        },
      )
    }
  },
  returns: v.null(),
})

/**
 * Restate unlisted rows under the current metadata selection, in scheduled pages.
 * Ingestion never rewrites an unlisted row, so selection changes reach existing unlistings only here.
 */
export const run = internalMutation({
  args: { atOrAfter: v.string() },
  handler: async (ctx, { atOrAfter }) => {
    await ctx.scheduler.runAfter(
      0,
      internal.ingestion.catalog.refreshUnlistedEndpoints.refreshPage,
      {
        atOrAfter,
        cursor: null,
        progress: { missing: [], read: 0, restated: 0 },
      },
    )
  },
  returns: v.null(),
})
