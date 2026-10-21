import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { CURRENT_MODELS_TABLE, currentModelsTable } from '../../catalog/tables/current'
import { commitProcess, createIngestor } from '../ingestor'
import type { Ingestor } from '../ingestor'
import { SCOPE_COVERAGE, supersedes } from '../operators/current'
import * as operator from '../operators/currentModels'
import { commitResult } from '../results'
import { currentScope } from '../tables'

export const ingest: Ingestor = createIngestor({
  process: 'currentModels',
  prepare: (_ctx, input) => ({
    scan_at: input.source.next.scan_at,
    scope: input.scope,
    rows: operator.derive(input.source, input.scope),
  }),
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.currentModels.write, args),
})

export const write = internalMutation({
  args: {
    process: v.string(),
    scan_at: v.string(),
    scope: currentScope,
    rows: v.array(currentModelsTable.validator),
  },
  returns: commitResult,
  handler: async (ctx, { rows, scan_at, scope, process }) =>
    await commitProcess(
      ctx,
      scan_at,
      process,
      async () => {
        for (const row of rows) {
          const existing = await ctx.db
            .query(CURRENT_MODELS_TABLE)
            .withIndex('by_model_id', (q) => q.eq('model_id', row.model_id))
            .unique()

          if (!supersedes(existing, row)) {
            continue
          }

          await (existing === null
            ? ctx.db.insert(CURRENT_MODELS_TABLE, row)
            : ctx.db.replace(CURRENT_MODELS_TABLE, existing._id, row))
        }
      },
      SCOPE_COVERAGE[scope],
    ),
})
