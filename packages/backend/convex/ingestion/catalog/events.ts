import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { EVENTS_TABLE, eventsTable } from '../../catalog/tables/events'
import { commitProcess, createIngestor, removeProcess } from '../ingestor'
import type { Ingestor } from '../ingestor'
import * as operator from '../operators/events'
import { commitResult, removeResult } from '../results'

export const ingest: Ingestor = createIngestor({
  prepare: (_ctx, input) => ({
    rows: operator.derive(input.source),
    scan_at: input.source.next.scan_at,
  }),
  process: 'events',
  remove: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.events.remove, args),
  write: async (ctx, args) => await ctx.runMutation(internal.ingestion.catalog.events.write, args),
})

export const remove = internalMutation({
  args: { process: v.string(), scan_at: v.string() },
  handler: async (ctx, { scan_at, process }) =>
    await removeProcess(ctx, scan_at, process, async () => {
      const rows = ctx.db
        .query(EVENTS_TABLE)
        .withIndex('by_scan_at', (q) => q.eq('scan_at', scan_at))

      for await (const row of rows) {
        await ctx.db.delete(EVENTS_TABLE, row._id)
      }
    }),
  returns: removeResult,
})

export const write = internalMutation({
  args: { process: v.string(), rows: v.array(eventsTable.validator), scan_at: v.string() },
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        await ctx.db.insert(EVENTS_TABLE, row)
      }
    }),
  returns: commitResult,
})
