import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { ENDPOINT_STATS_TABLE, endpointStatsTable } from '../../catalog/tables/stats'
import type { EndpointStatsRow } from '../../catalog/tables/stats'
import {
  commitProcess,
  commitResult,
  createIngestor,
  removeProcess,
  removeResult,
} from '../ingestor'
import type { Ingestor } from '../ingestor'

export const ingest: Ingestor = createIngestor({
  process: 'statsHistory',
  prepare(_ctx, { next }) {
    const rows: EndpointStatsRow[] = next.stats.map((stats) => ({
      ...stats,
      scan_at: next.scan_at,
    }))

    return { scan_at: next.scan_at, rows }
  },
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.statsHistory.write, args),
  remove: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.statsHistory.remove, args),
})

export const remove = internalMutation({
  args: { scan_at: v.string(), process: v.string() },
  returns: removeResult,
  handler: async (ctx, { scan_at, process }) =>
    await removeProcess(ctx, scan_at, process, async () => {
      const rows = ctx.db
        .query(ENDPOINT_STATS_TABLE)
        .withIndex('by_scan_at', (q) => q.eq('scan_at', scan_at))

      for await (const row of rows) {
        await ctx.db.delete(ENDPOINT_STATS_TABLE, row._id)
      }
    }),
})

export const write = internalMutation({
  args: { process: v.string(), scan_at: v.string(), rows: v.array(endpointStatsTable.validator) },
  returns: commitResult,
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        await ctx.db.insert(ENDPOINT_STATS_TABLE, row)
      }
    }),
})
