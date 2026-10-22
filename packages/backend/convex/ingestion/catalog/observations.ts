import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { OBSERVATIONS_TABLE, observationsTable } from '../../catalog/tables/observations'
import { commitProcess, createIngestor, removeProcess } from '../ingestor'
import type { Ingestor } from '../ingestor'
import * as operator from '../operators/observations'
import { commitResult, removeResult } from '../results'

export const ingest: Ingestor = createIngestor({
  prepare: (_ctx, input) => ({
    rows: operator.derive(input.source),
    scan_at: input.source.next.scan_at,
  }),
  process: 'observations',
  remove: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.observations.remove, args),
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.observations.write, args),
})

export const remove = internalMutation({
  args: { process: v.string(), scan_at: v.string() },
  handler: async (ctx, { scan_at, process }) =>
    await removeProcess(ctx, scan_at, process, async () => {
      const rows = ctx.db
        .query(OBSERVATIONS_TABLE)
        .withIndex('by_scan_at', (q) => q.eq('scan_at', scan_at))

      for await (const row of rows) {
        await ctx.db.delete(OBSERVATIONS_TABLE, row._id)
      }
    }),
  returns: removeResult,
})

export const write = internalMutation({
  args: { process: v.string(), rows: v.array(observationsTable.validator), scan_at: v.string() },
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        await ctx.db.insert(OBSERVATIONS_TABLE, row)
      }
    }),
  returns: commitResult,
})
