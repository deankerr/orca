import { ConvexError, v } from 'convex/values'

import { internalMutation } from '../_generated/server'
import { getCurrentScan, recordIngestion } from '../v3/ingestions'
import { V3_SCAN_INGESTIONS_TABLE, scanIngestionsTable } from '../v3/ingestions.table'
import {
  V3_ENDPOINTS_VIEW_TABLE,
  V3_MODELS_VIEW_TABLE,
  V3_PROVIDERS_VIEW_TABLE,
  endpointsViewTable,
  modelsViewTable,
  providersViewTable,
} from './entities.table'
import {
  V3_ENDPOINTS_LISTING_SERIES_TABLE,
  V3_ENDPOINTS_PRICING_SERIES_TABLE,
  V3_ENDPOINTS_STATS_SERIES_TABLE,
  endpointsListingTable,
  endpointsPricingTable,
  endpointsStatsTable,
} from './series.table'

const cursorArgs = { fromArtifactId: v.string(), toArtifactId: v.string() }

/** Apply models rows with retry-safe writes. */
export const models = internalMutation({
  args: { rows: v.array(modelsViewTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query(V3_MODELS_VIEW_TABLE)
        .withIndex('by_model_id', (q) => q.eq('model_id', row.model_id))
        .unique()

      await (existing === null
        ? ctx.db.insert(V3_MODELS_VIEW_TABLE, row)
        : ctx.db.replace(existing._id, row))
    }
    return null
  },
})

/** Apply providers rows with retry-safe writes. */
export const providers = internalMutation({
  args: { rows: v.array(providersViewTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query(V3_PROVIDERS_VIEW_TABLE)
        .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
        .unique()

      await (existing === null
        ? ctx.db.insert(V3_PROVIDERS_VIEW_TABLE, row)
        : ctx.db.replace(existing._id, row))
    }
    return null
  },
})

/** Apply endpoints rows with retry-safe writes. */
export const endpoints = internalMutation({
  args: { rows: v.array(endpointsViewTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query(V3_ENDPOINTS_VIEW_TABLE)
        .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', row.endpoint_id))
        .unique()

      await (existing === null
        ? ctx.db.insert(V3_ENDPOINTS_VIEW_TABLE, row)
        : ctx.db.replace(existing._id, row))
    }
    return null
  },
})

/** Apply endpointListings rows with retry-safe writes. */
export const endpointListings = internalMutation({
  args: { rows: v.array(endpointsListingTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query(V3_ENDPOINTS_LISTING_SERIES_TABLE)
        .withIndex('by_endpoint_id_and_scan_at', (q) =>
          q.eq('endpoint_id', row.endpoint_id).eq('scan_at', row.scan_at),
        )
        .unique()

      if (existing === null) {
        await ctx.db.insert(V3_ENDPOINTS_LISTING_SERIES_TABLE, row)
      }
    }
    return null
  },
})

/** Apply endpointsPricing rows with retry-safe writes. */
export const endpointsPricing = internalMutation({
  args: { rows: v.array(endpointsPricingTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query(V3_ENDPOINTS_PRICING_SERIES_TABLE)
        .withIndex('by_endpoint_id_and_scan_at', (q) =>
          q.eq('endpoint_id', row.endpoint_id).eq('scan_at', row.scan_at),
        )
        .unique()

      if (existing === null) {
        await ctx.db.insert(V3_ENDPOINTS_PRICING_SERIES_TABLE, row)
      }
    }
    return null
  },
})

/** Append stats and advance the cursor in one transaction, including empty scans. */
export const stats = internalMutation({
  args: { ...cursorArgs, scan_at: v.string(), rows: v.array(endpointsStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !(await recordIngestion(ctx, {
        from_artifact_id: args.fromArtifactId,
        to_artifact_id: args.toArtifactId,
        scan_at: args.scan_at,
      }))
    ) {
      return null
    }

    for (const row of args.rows) {
      await ctx.db.insert(V3_ENDPOINTS_STATS_SERIES_TABLE, row)
    }
    return null
  },
})

/** Import scan stats and their ingestion record together, including scans without readings. */
export const currentScan = internalMutation({
  args: { scan: scanIngestionsTable.validator, rows: v.array(endpointsStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { scan, rows }) => {
    if (rows.some((row) => row.scan_at !== scan.scan_at)) {
      throw new ConvexError('Pulled readings must belong to the captured scan')
    }
    const latest = await getCurrentScan(ctx)
    const existing = await ctx.db
      .query(V3_ENDPOINTS_STATS_SERIES_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', scan.scan_at))
      .collect()
    const keys = new Set(existing.map((row) => JSON.stringify([row.endpoint_id, row.tier])))
    for (const row of rows) {
      const key = JSON.stringify([row.endpoint_id, row.tier])
      if (!keys.has(key)) {
        await ctx.db.insert(V3_ENDPOINTS_STATS_SERIES_TABLE, row)
        keys.add(key)
      }
    }
    if (latest?.to_artifact_id !== scan.to_artifact_id) {
      await ctx.db.insert(V3_SCAN_INGESTIONS_TABLE, scan)
    }
    return null
  },
})

/** Replace metadata atomically after every provider source has been resolved. */
export const refreshProviders = internalMutation({
  args: { rows: v.array(providersViewTable.validator.pick('provider_id', 'metadata')) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      const existing = await ctx.db
        .query(V3_PROVIDERS_VIEW_TABLE)
        .withIndex('by_provider_id', (q) => q.eq('provider_id', row.provider_id))
        .unique()
      if (existing === null) {
        throw new ConvexError(`Provider view missing during refresh: ${row.provider_id}`)
      }
      await ctx.db.patch(existing._id, { metadata: row.metadata })
    }
    return null
  },
})
