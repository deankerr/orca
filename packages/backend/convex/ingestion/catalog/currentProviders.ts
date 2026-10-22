import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { CURRENT_PROVIDERS_TABLE, currentProvidersTable } from '../../catalog/tables/current'
import { commitProcess, createIngestor } from '../ingestor'
import type { Ingestor } from '../ingestor'
import { SCOPE_COVERAGE, supersedes } from '../operators/current'
import * as operator from '../operators/currentProviders'
import { commitResult } from '../results'
import { currentScope } from '../tables'

export const ingest: Ingestor = createIngestor({
  prepare: (_ctx, input) => ({
    rows: operator.derive(input.source, input.scope),
    scan_at: input.source.next.scan_at,
    scope: input.scope,
  }),
  process: 'currentProviders',
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.currentProviders.write, args),
})

export const write = internalMutation({
  args: {
    process: v.string(),
    rows: v.array(currentProvidersTable.validator),
    scan_at: v.string(),
    scope: currentScope,
  },
  handler: async (ctx, { rows, scan_at, scope, process }) =>
    await commitProcess(
      ctx,
      scan_at,
      process,
      async () => {
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
      },
      SCOPE_COVERAGE[scope],
    ),
  returns: commitResult,
})
