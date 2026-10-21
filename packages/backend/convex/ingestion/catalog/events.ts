import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { EVENTS_TABLE, eventsTable } from '../../catalog/tables/events'
import { commitProcess, createIngestor, removeProcess } from '../ingestor'
import type { Ingestor } from '../ingestor'
import * as operator from '../operators/events'
import { commitResult, removeResult } from '../results'

export const ingest: Ingestor = createIngestor({
  process: 'events',
  prepare: (_ctx, input) => ({
    scan_at: input.source.next.scan_at,
    rows: operator.derive(input.source),
  }),
  write: async (ctx, args) => await ctx.runMutation(internal.ingestion.catalog.events.write, args),
  remove: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.events.remove, args),
})

export const remove = internalMutation({
  args: { scan_at: v.string(), process: v.string() },
  returns: removeResult,
  handler: async (ctx, { scan_at, process }) =>
    await removeProcess(ctx, scan_at, process, async () => {
      const rows = ctx.db
        .query(EVENTS_TABLE)
        .withIndex('by_scan_at', (q) => q.eq('scan_at', scan_at))

      for await (const row of rows) {
        await ctx.db.delete(EVENTS_TABLE, row._id)
      }
    }),
})

export const write = internalMutation({
  args: { process: v.string(), scan_at: v.string(), rows: v.array(eventsTable.validator) },
  returns: commitResult,
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        await ctx.db.insert(EVENTS_TABLE, row)
      }
    }),
})
