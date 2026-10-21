import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { CURRENT_ENDPOINTS_TABLE, currentEndpointsTable } from '../../catalog/tables/current'
import { commitProcess, createIngestor } from '../ingestor'
import type { Ingestor } from '../ingestor'
import { supersedes } from '../operators/current'
import * as operator from '../operators/currentEndpoints'
import { commitResult } from '../results'

export const ingest: Ingestor = createIngestor({
  process: 'currentEndpoints',
  prepare: (_ctx, input) => ({
    scan_at: input.source.next.scan_at,
    rows: operator.derive(input.source, input.scope),
  }),
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.currentEndpoints.write, args),
})

export const write = internalMutation({
  args: {
    process: v.string(),
    scan_at: v.string(),
    rows: v.array(currentEndpointsTable.validator),
  },
  returns: commitResult,
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        const existing = await ctx.db
          .query(CURRENT_ENDPOINTS_TABLE)
          .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', row.endpoint_id))
          .unique()

        if (!supersedes(existing, row)) {
          continue
        }

        await (existing === null
          ? ctx.db.insert(CURRENT_ENDPOINTS_TABLE, row)
          : ctx.db.replace(CURRENT_ENDPOINTS_TABLE, existing._id, row))
      }
    }),
})
