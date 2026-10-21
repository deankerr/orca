import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { CURRENT_PROVIDERS_TABLE, currentProvidersTable } from '../../catalog/tables/current'
import { commitProcess, createIngestor } from '../ingestor'
import type { Ingestor } from '../ingestor'
import { supersedes } from '../operators/current'
import * as operator from '../operators/currentProviders'
import { commitResult } from '../results'

export const ingest: Ingestor = createIngestor({
  process: 'currentProviders',
  prepare: (_ctx, input) => ({
    scan_at: input.source.next.scan_at,
    rows: operator.derive(input.source, input.scope),
  }),
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.currentProviders.write, args),
})

export const write = internalMutation({
  args: {
    process: v.string(),
    scan_at: v.string(),
    rows: v.array(currentProvidersTable.validator),
  },
  returns: commitResult,
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        const existing = await ctx.db
          .query(CURRENT_PROVIDERS_TABLE)
          .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
          .unique()

        if (!supersedes(existing, row)) {
          continue
        }

        await (existing === null
          ? ctx.db.insert(CURRENT_PROVIDERS_TABLE, row)
          : ctx.db.replace(CURRENT_PROVIDERS_TABLE, existing._id, row))
      }
    }),
})
