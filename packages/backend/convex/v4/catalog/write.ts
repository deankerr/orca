import { v } from 'convex/values'

import { internalMutation } from '../../_generated/server'
import { finishStep, stepArgs } from '../ingestion/step'
import {
  V4_CURRENT_ENDPOINTS_TABLE,
  V4_CURRENT_MODELS_TABLE,
  V4_CURRENT_PROVIDERS_TABLE,
  currentEndpointsTable,
  currentModelsTable,
  currentProvidersTable,
} from './table'

/** Upsert changed models and advance their ingestion phase; omitted models remain known. */
export const models = internalMutation({
  args: { ...stepArgs, rows: v.array(currentModelsTable.validator) },
  returns: v.string(),
  handler: async (ctx, args) =>
    await finishStep(ctx, { ...args, output: 'models' }, args.rows, async (ctx, rows) => {
      for (const row of rows) {
        const existing = await ctx.db
          .query(V4_CURRENT_MODELS_TABLE)
          .withIndex('by_model_id', (q) => q.eq('model_id', row.model_id))
          .unique()

        await (existing === null
          ? ctx.db.insert(V4_CURRENT_MODELS_TABLE, row)
          : ctx.db.replace(V4_CURRENT_MODELS_TABLE, existing._id, row))
      }
    }),
})

/** Upsert changed providers and advance their ingestion phase; omitted providers remain known. */
export const providers = internalMutation({
  args: { ...stepArgs, rows: v.array(currentProvidersTable.validator) },
  returns: v.string(),
  handler: async (ctx, args) =>
    await finishStep(ctx, { ...args, output: 'providers' }, args.rows, async (ctx, rows) => {
      for (const row of rows) {
        const existing = await ctx.db
          .query(V4_CURRENT_PROVIDERS_TABLE)
          .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
          .unique()

        await (existing === null
          ? ctx.db.insert(V4_CURRENT_PROVIDERS_TABLE, row)
          : ctx.db.replace(V4_CURRENT_PROVIDERS_TABLE, existing._id, row))
      }
    }),
})

/** Upsert endpoint changes, including unlisting; a full replacement clears unlisted_at on return. */
export const endpoints = internalMutation({
  args: { ...stepArgs, rows: v.array(currentEndpointsTable.validator) },
  returns: v.string(),
  handler: async (ctx, args) =>
    await finishStep(ctx, { ...args, output: 'endpoints' }, args.rows, async (ctx, rows) => {
      for (const row of rows) {
        const existing = await ctx.db
          .query(V4_CURRENT_ENDPOINTS_TABLE)
          .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', row.endpoint_id))
          .unique()

        await (existing === null
          ? ctx.db.insert(V4_CURRENT_ENDPOINTS_TABLE, row)
          : ctx.db.replace(V4_CURRENT_ENDPOINTS_TABLE, existing._id, row))
      }
    }),
})
