import { v } from 'convex/values'

import { internalMutation } from '../../_generated/server'
import {
  V3_ENDPOINTS_VIEW_TABLE,
  V3_MODELS_VIEW_TABLE,
  V3_PROVIDERS_VIEW_TABLE,
} from '../entities.table'
import { V3_SCAN_INGESTIONS_TABLE } from '../ingestions.table'
import {
  V3_ENDPOINTS_LISTING_SERIES_TABLE,
  V3_ENDPOINTS_PRICING_SERIES_TABLE,
  V3_ENDPOINTS_STATS_SERIES_TABLE,
} from '../series.table'
import { ScanProjectionWrite } from './diff'

export const run = internalMutation({
  args: {
    fromArtifactId: v.string(),
    toArtifactId: v.string(),
    writes: v.array(ScanProjectionWrite),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log('apply counts', {
      models: args.writes.filter(({ table }) => table === 'models').length,
      providers: args.writes.filter(({ table }) => table === 'providers').length,
      endpoints: args.writes.filter(({ table }) => table === 'endpoints').length,
      listings: args.writes.filter(({ table }) => table === 'endpointListings').length,
      pricing: args.writes.filter(({ table }) => table === 'endpointsPricing').length,
      stats: args.writes.filter(({ table }) => table === 'stats').length,
    })

    // ponytail: one transaction assumes a scan fits Convex limits; split only when it does not.
    for (const write of args.writes) {
      if (write.table === 'models') {
        const existing = await ctx.db
          .query(V3_MODELS_VIEW_TABLE)
          .withIndex('by_model_id', (q) => q.eq('model_id', write.row.model_id))
          .unique()
        await (existing === null
          ? ctx.db.insert(V3_MODELS_VIEW_TABLE, write.row)
          : ctx.db.replace(existing._id, write.row))
        continue
      }

      if (write.table === 'providers') {
        const existing = await ctx.db
          .query(V3_PROVIDERS_VIEW_TABLE)
          .withIndex('by_provider_id', (q) => q.eq('provider_id', write.row.provider_id))
          .unique()
        await (existing === null
          ? ctx.db.insert(V3_PROVIDERS_VIEW_TABLE, write.row)
          : ctx.db.replace(existing._id, write.row))
        continue
      }

      if (write.table === 'endpoints') {
        const existing = await ctx.db
          .query(V3_ENDPOINTS_VIEW_TABLE)
          .withIndex('by_endpoint_id', (q) => q.eq('endpoint_id', write.row.endpoint_id))
          .unique()
        await (existing === null
          ? ctx.db.insert(V3_ENDPOINTS_VIEW_TABLE, write.row)
          : ctx.db.replace(existing._id, write.row))
        continue
      }

      if (write.table === 'endpointListings') {
        await ctx.db.insert(V3_ENDPOINTS_LISTING_SERIES_TABLE, write.row)
        continue
      }

      if (write.table === 'endpointsPricing') {
        await ctx.db.insert(V3_ENDPOINTS_PRICING_SERIES_TABLE, write.row)
        continue
      }

      await ctx.db.insert(V3_ENDPOINTS_STATS_SERIES_TABLE, write.row)
    }

    await ctx.db.insert(V3_SCAN_INGESTIONS_TABLE, {
      from_artifact_id: args.fromArtifactId,
      to_artifact_id: args.toArtifactId,
    })
    return null
  },
})
