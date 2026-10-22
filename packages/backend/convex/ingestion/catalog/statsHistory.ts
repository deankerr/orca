import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { ENDPOINT_STATS_TABLE, endpointStatsTable } from '../../catalog/tables/stats'
import { commitProcess, createIngestor, removeProcess } from '../ingestor'
import type { Ingestor } from '../ingestor'
import * as operator from '../operators/statsHistory'
import { commitResult, removeResult } from '../results'

export const ingest: Ingestor = createIngestor({
  prepare: (_ctx, input) => ({
    rows: operator.derive(input.source),
    scan_at: input.source.next.scan_at,
  }),
  process: 'statsHistory',
  remove: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.statsHistory.remove, args),
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.statsHistory.write, args),
})

export const remove = internalMutation({
  args: { process: v.string(), scan_at: v.string() },
  handler: async (ctx, { scan_at, process }) =>
    await removeProcess(ctx, scan_at, process, async () => {
      const rows = ctx.db
        .query(ENDPOINT_STATS_TABLE)
        .withIndex('by_scan_at', (q) => q.eq('scan_at', scan_at))

      for await (const row of rows) {
        await ctx.db.delete(ENDPOINT_STATS_TABLE, row._id)
      }
    }),
  returns: removeResult,
})

export const write = internalMutation({
  args: { process: v.string(), rows: v.array(endpointStatsTable.validator), scan_at: v.string() },
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        await ctx.db.insert(ENDPOINT_STATS_TABLE, row)
      }
    }),
  returns: commitResult,
})
