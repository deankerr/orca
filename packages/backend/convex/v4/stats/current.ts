import { withoutSystemFields } from 'convex-helpers'
import { ConvexError, v } from 'convex/values'
import { isDeepEqual } from 'remeda'
import { z } from 'zod'

import { internal } from '../../_generated/api'
import { internalAction, internalMutation, internalQuery, query } from '../../_generated/server'
import { findCursor, ingestionScanAt } from '../ingestion/clock'
import { V4_CURSORS_TABLE, V4_INGESTIONS_TABLE } from '../ingestion/table'
import { assertScanAt, load } from '../scan'
import type { Scan } from '../scan'
import { V4_CURRENT_STATS_TABLE, currentStatsTable } from './table'
import type { CurrentStatsRow } from './table'

/** Every reading comes from the cursor's scan; the grid always needs all of them. */
export const grid = query({
  args: {},
  returns: v.object({
    as_of: v.union(v.null(), v.string()),
    rows: v.array(currentStatsTable.validator),
  }),
  handler: async (ctx) => {
    const cursor = await findCursor(ctx, 'current_stats')
    const rows = await ctx.db.query(V4_CURRENT_STATS_TABLE).collect()
    return { as_of: cursor?.scan_at ?? null, rows: rows.map(withoutSystemFields) }
  },
})

/** Publish a complete snapshot and its observation time, or ignore superseded/duplicate work. */
export const publish = internalMutation({
  args: { scan_at: v.string(), rows: v.array(currentStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log('[v4:current-stats] publish', { scan_at: args.scan_at, incoming: args.rows.length })
    assertScanAt(args.scan_at)
    const cursor = await findCursor(ctx, 'current_stats')

    if (cursor !== null && cursor.scan_at !== null && cursor.scan_at >= args.scan_at) {
      return null
    }

    const ingestion = await ctx.db
      .query(V4_INGESTIONS_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', args.scan_at))
      .unique()

    if (ingestion === null) {
      throw new ConvexError('Stats observation has not been released')
    }

    const stored = await ctx.db.query(V4_CURRENT_STATS_TABLE).collect()
    const existing = new Map(stored.map((row) => [row.endpoint_id, row]))
    const inserts = []
    const replaces = []
    for (const row of args.rows) {
      const current = existing.get(row.endpoint_id)
      existing.delete(row.endpoint_id)

      if (current === undefined) {
        inserts.push(row)
      } else if (!isDeepEqual(withoutSystemFields(current), row)) {
        replaces.push({ id: current._id, row })
      }
    }

    console.log('[v4:current-stats] reconcile', {
      scan_at: args.scan_at,
      stored: stored.length,
      inserts: inserts.length,
      replaces: replaces.length,
      deletes: existing.size,
    })
    for (const row of inserts) {
      await ctx.db.insert(V4_CURRENT_STATS_TABLE, row)
    }
    for (const { id, row } of replaces) {
      await ctx.db.replace(V4_CURRENT_STATS_TABLE, id, row)
    }
    for (const stale of existing.values()) {
      await ctx.db.delete(V4_CURRENT_STATS_TABLE, stale._id)
    }
    await (cursor === null
      ? ctx.db.insert(V4_CURSORS_TABLE, { module: 'current_stats', scan_at: args.scan_at })
      : ctx.db.patch(V4_CURSORS_TABLE, cursor._id, { scan_at: args.scan_at }))
    return null
  },
})

/** Skip already-published observations before fetching; publish still guards concurrent attempts. */
export const getRefreshScanAt = internalQuery({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx) => {
    const scanAt = await ingestionScanAt(ctx)

    if (scanAt === null) {
      return null
    }

    const cursor = await findCursor(ctx, 'current_stats')
    return cursor !== null && cursor.scan_at !== null && cursor.scan_at >= scanAt ? null : scanAt
  },
})

/** Scheduled after release, or manual recovery: refresh only the newest unpublished observation. */
export const refreshLatest = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const scanAt: string | null = await ctx.runQuery(internal.v4.stats.current.getRefreshScanAt, {})

    if (scanAt === null) {
      return null
    }

    const rows = prepare(await load(ctx, scanAt))

    console.log('[v4:current-stats] prepared', {
      scan_at: scanAt,
      rows: rows.length,
      argumentLength: JSON.stringify(rows).length,
    })

    await ctx.runMutation(internal.v4.stats.current.publish, { scan_at: scanAt, rows })
    return null
  },
})

const reading = z.number().nonnegative().optional().catch(undefined)

const Sample = z
  .object({ p50_throughput: reading, p50_latency: reading })
  .optional()
  .catch(undefined)

const SuppliedStats = z.object({
  stats: Sample,
  statsByTier: z.object({ default: Sample }).optional().catch(undefined),
})

/** Null, malformed and missing readings are all "no reading". */
function prepare(scan: Scan): CurrentStatsRow[] {
  return [...scan.endpoints.values()].flatMap((endpoint) => {
    const { stats, statsByTier } = SuppliedStats.parse(endpoint)
    const { p50_throughput, p50_latency } = statsByTier?.default ?? stats ?? {}

    if (p50_throughput === undefined && p50_latency === undefined) {
      return []
    }

    const row: CurrentStatsRow = { endpoint_id: endpoint.id }

    if (p50_throughput !== undefined) {
      row.p50_throughput = p50_throughput
    }

    if (p50_latency !== undefined) {
      row.p50_latency = p50_latency
    }

    return [row]
  })
}
