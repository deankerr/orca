import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { CURRENT_STATS_TABLE, currentStatsTable } from '../../catalog/tables/current'
import { commitProcess, createIngestor } from '../ingestor'
import type { Ingestor } from '../ingestor'
import * as operator from '../operators/currentStats'
import { commitResult } from '../results'

export const ingest: Ingestor = createIngestor({
  process: 'currentStats',
  prepare: (_ctx, input) => ({
    scan_at: input.source.next.scan_at,
    rows: input.current_stats ? operator.derive(input.source).rows : null,
  }),
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.currentStats.write, args),
})

export const write = internalMutation({
  args: {
    process: v.string(),
    scan_at: v.string(),
    // Null defers the snapshot; an empty array replaces it with no readings.
    rows: v.union(v.null(), currentStatsTable.validator.fields.rows),
  },
  returns: commitResult,
  handler: async (ctx, { scan_at, rows, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      if (rows === null) {
        return
      }

      const snapshot = { scan_at, rows }
      const existing = await ctx.db.query(CURRENT_STATS_TABLE).unique()

      if (existing === null) {
        await ctx.db.insert(CURRENT_STATS_TABLE, snapshot)
      } else if (operator.supersedes(existing, snapshot)) {
        await ctx.db.replace(CURRENT_STATS_TABLE, existing._id, snapshot)
      }
    }),
})
