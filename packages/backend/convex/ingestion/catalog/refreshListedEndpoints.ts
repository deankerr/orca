import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '#generated/api'
import { internalAction, internalMutation, internalQuery } from '#generated/server'
import * as scans from '#scans'
import type { Scan } from '#scans/extraction'

import { CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from '../../catalog/tables/current'
import { clock } from '../../products/shared/clock'
import { endpointRow } from '../operators/currentEndpoints'

/** Listed rows per page; one page bounds each read, restate mutation, and scheduled step. */
const PAGE_SIZE = 100

const listedRow = v.object({ _id: v.id(CURRENT_ENDPOINTS_TABLE), endpoint_id: v.string() })

type ListedRow = Infer<typeof listedRow>

const restatement = v.object({ _id: listedRow.fields._id, row: currentEndpointsTable.validator })

type Restatement = Infer<typeof restatement>

const listedPageResult = v.object({
  continueCursor: v.string(),
  isDone: v.boolean(),
  rows: v.array(listedRow),
})

const progress = v.object({ missing: v.array(v.string()), read: v.number(), restated: v.number() })

export const listedPage = internalQuery({
  args: { cursor: v.union(v.null(), v.string()) },
  handler: async (ctx, { cursor }) => {
    const { page, continueCursor, isDone } = await ctx.db
      .query(CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_unlisted_at', (q) => q.eq('unlisted_at', undefined))
      .paginate({ cursor, numItems: PAGE_SIZE })

    return {
      continueCursor,
      isDone,
      rows: page.map(({ _id, endpoint_id }) => ({ _id, endpoint_id })),
    }
  },
  returns: listedPageResult,
})

/** Rows unlisted or ingested past the refresh scan since the read are newer; skip them. */
export const restate = internalMutation({
  args: { restatements: v.array(restatement) },
  handler: async (ctx, { restatements }) => {
    let restated = 0

    for (const { _id, row } of restatements) {
      const retained = await ctx.db.get(CURRENT_ENDPOINTS_TABLE, _id)

      if (
        retained !== null &&
        retained.unlisted_at === undefined &&
        retained.scan_at <= row.scan_at
      ) {
        await ctx.db.replace(CURRENT_ENDPOINTS_TABLE, _id, row)
        restated += 1
      }
    }

    return restated
  },
  returns: v.number(),
})

/** Listed rows as ingestion now derives them from the refresh scan. */
function restateFrom(source: Scan, rows: ListedRow[]) {
  const restatements: Restatement[] = []
  const missing: string[] = []

  for (const { _id, endpoint_id } of rows) {
    const endpoint = source.endpoints.get(endpoint_id)

    if (endpoint === undefined) {
      missing.push(endpoint_id)
    } else {
      restatements.push({ _id, row: endpointRow(endpoint, { scan_at: source.scan_at }) })
    }
  }

  return { missing, restatements }
}

/** One bounded page of the refresh; schedules the next until every listed row is read. */
export const refreshPage = internalAction({
  args: { cursor: v.union(v.null(), v.string()), progress, scanAt: v.string() },
  handler: async (ctx, { cursor, progress: before, scanAt }) => {
    const page: Infer<typeof listedPageResult> = await ctx.runQuery(
      internal.ingestion.catalog.refreshListedEndpoints.listedPage,
      { cursor },
    )

    const { missing, restatements } = restateFrom(await scans.load(ctx, scanAt), page.rows)

    const restated: number = await ctx.runMutation(
      internal.ingestion.catalog.refreshListedEndpoints.restate,
      { restatements },
    )

    const after = {
      missing: [...before.missing, ...missing],
      read: before.read + page.rows.length,
      restated: before.restated + restated,
    }

    if (page.isDone) {
      console.log('Refreshed listed endpoints', after)
    } else {
      await ctx.scheduler.runAfter(
        0,
        internal.ingestion.catalog.refreshListedEndpoints.refreshPage,
        { cursor: page.continueCursor, progress: after, scanAt },
      )
    }
  },
  returns: v.null(),
})

/**
 * Restate listed rows under the current metadata selection, in scheduled pages, from the latest
 * scan with committed output. Ingestion compares both sides of a pair under the current selection,
 * so a selection change alone never rewrites a listed row.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    const scanAt = await clock(ctx)

    if (scanAt === null) {
      throw new Error('No committed scan to refresh from')
    }

    await ctx.scheduler.runAfter(0, internal.ingestion.catalog.refreshListedEndpoints.refreshPage, {
      cursor: null,
      progress: { missing: [], read: 0, restated: 0 },
      scanAt,
    })
  },
  returns: v.null(),
})
