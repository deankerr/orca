import { docValidator } from 'convex/server'
import { v } from 'convex/values'

import { internalQuery } from '../../_generated/server'
import { currentScanAt } from '../ingestion/clock'
import {
  V4_CURRENT_ENDPOINTS_TABLE,
  V4_CURRENT_MODELS_TABLE,
  V4_CURRENT_PROVIDERS_TABLE,
  currentEndpointsTable,
  currentModelsTable,
  currentProvidersTable,
} from './table'

const UNLISTED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Listed endpoints plus those unlisted within 30 days of the ORCA clock.
 * Older last-known rows stay stored and are absent from this window.
 */
export const grid = internalQuery({
  args: {},
  returns: v.array(docValidator(V4_CURRENT_ENDPOINTS_TABLE, currentEndpointsTable)),
  handler: async (ctx) => {
    const scanAt = await currentScanAt(ctx)

    if (scanAt === null) {
      return []
    }

    const cutoff = new Date(Date.parse(scanAt) - UNLISTED_WINDOW_MS).toISOString()
    const listed = await ctx.db
      .query(V4_CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_unlisted_at', (q) => q.eq('unlisted_at', undefined))
      .collect()
    const unlisted = await ctx.db
      .query(V4_CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_unlisted_at', (q) => q.gte('unlisted_at', cutoff))
      .collect()

    return [...listed, ...unlisted]
  },
})

/** Current model, including a model with no listed endpoints. */
export const model = internalQuery({
  args: { model_id: v.string() },
  returns: v.union(v.null(), docValidator(V4_CURRENT_MODELS_TABLE, currentModelsTable)),
  handler: async (ctx, args) =>
    await ctx.db
      .query(V4_CURRENT_MODELS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', args.model_id))
      .unique(),
})

/** Current provider, including a provider with no listed endpoints. */
export const provider = internalQuery({
  args: { provider_id: v.string() },
  returns: v.union(v.null(), docValidator(V4_CURRENT_PROVIDERS_TABLE, currentProvidersTable)),
  handler: async (ctx, args) =>
    await ctx.db
      .query(V4_CURRENT_PROVIDERS_TABLE)
      .withIndex('by_provider_id', (q) => q.eq('provider_id', args.provider_id))
      .unique(),
})

/** Current or last-known endpoint. */
export const endpoint = internalQuery({
  args: { endpoint_id: v.string() },
  returns: v.union(v.null(), docValidator(V4_CURRENT_ENDPOINTS_TABLE, currentEndpointsTable)),
  handler: async (ctx, args) =>
    await ctx.db
      .query(V4_CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', args.endpoint_id))
      .unique(),
})

/** Current endpoints for one model. */
export const modelEndpoints = internalQuery({
  args: { model_id: v.string() },
  returns: v.array(docValidator(V4_CURRENT_ENDPOINTS_TABLE, currentEndpointsTable)),
  handler: async (ctx, args) =>
    await ctx.db
      .query(V4_CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_model_id', (q) => q.eq('model_id', args.model_id))
      .collect(),
})

/** Current endpoints for one provider and model. */
export const providerModelEndpoints = internalQuery({
  args: { provider_id: v.string(), model_id: v.string() },
  returns: v.array(docValidator(V4_CURRENT_ENDPOINTS_TABLE, currentEndpointsTable)),
  handler: async (ctx, args) =>
    await ctx.db
      .query(V4_CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_provider_id_and_model_id', (q) =>
        q.eq('provider_id', args.provider_id).eq('model_id', args.model_id),
      )
      .collect(),
})
