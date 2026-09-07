import { v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { ActionCtx, MutationCtx } from '../../_generated/server'
import {
  V3_ENDPOINTS_VIEW_TABLE,
  V3_MODELS_VIEW_TABLE,
  V3_PROVIDERS_VIEW_TABLE,
  endpointsViewTable,
  modelsViewTable,
  providersViewTable,
} from '../entities.table'
import { INITIAL_SCAN_ARTIFACT_ID, V3_SCAN_INGESTIONS_TABLE } from '../ingestions.table'
import {
  V3_ENDPOINTS_LISTING_SERIES_TABLE,
  V3_ENDPOINTS_PRICING_SERIES_TABLE,
  V3_ENDPOINTS_STATS_SERIES_TABLE,
  endpointsListingTable,
  endpointsPricingTable,
  endpointsStatsTable,
} from '../series.table'
import type { ScanProjectionWrite } from './diff'

const cursorArgs = { fromArtifactId: v.string(), toArtifactId: v.string() }
type Cursor = { fromArtifactId: string; toArtifactId: string }

/** Apply each table atomically; stats and the ingestion cursor commit last. */
export async function applyScanProjection(
  ctx: Pick<ActionCtx, 'runMutation'>,
  args: Cursor & { writes: ScanProjectionWrite[] },
) {
  const { writes, ...cursor } = args
  console.log({ ...cursor, writes: writes.length })
  const modelsRows = writes.filter((write) => write.table === 'models').map((write) => write.row)

  if (modelsRows.length > 0) {
    await ctx.runMutation(internal.v3.projections.apply.models, { rows: modelsRows })
  }

  const providersRows = writes
    .filter((write) => write.table === 'providers')
    .map((write) => write.row)

  if (providersRows.length > 0) {
    await ctx.runMutation(internal.v3.projections.apply.providers, {
      rows: providersRows,
    })
  }

  const endpointsRows = writes
    .filter((write) => write.table === 'endpoints')
    .map((write) => write.row)

  if (endpointsRows.length > 0) {
    await ctx.runMutation(internal.v3.projections.apply.endpoints, {
      rows: endpointsRows,
    })
  }

  const endpointListingsRows = writes
    .filter((write) => write.table === 'endpointListings')
    .map((write) => write.row)

  if (endpointListingsRows.length > 0) {
    await ctx.runMutation(internal.v3.projections.apply.endpointListings, {
      rows: endpointListingsRows,
    })
  }

  const endpointsPricingRows = writes
    .filter((write) => write.table === 'endpointsPricing')
    .map((write) => write.row)

  if (endpointsPricingRows.length > 0) {
    await ctx.runMutation(internal.v3.projections.apply.endpointsPricing, {
      rows: endpointsPricingRows,
    })
  }

  const statsRows = writes.filter((write) => write.table === 'stats').map((write) => write.row)
  await ctx.runMutation(internal.v3.projections.apply.stats, { ...cursor, rows: statsRows })
}

/** Reject stale work and skip an already committed ingestion. */
async function shouldApply(ctx: MutationCtx, args: Cursor) {
  const latest = await ctx.db.query(V3_SCAN_INGESTIONS_TABLE).order('desc').first()
  const current = latest?.to_artifact_id ?? INITIAL_SCAN_ARTIFACT_ID

  if (current === args.toArtifactId) {
    return false
  }

  if (current !== args.fromArtifactId) {
    throw new Error('Projection ingestion cursor changed')
  }

  return true
}

/** Apply models rows with replay-safe writes. */
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

/** Apply providers rows with replay-safe writes. */
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

/** Apply endpoints rows with replay-safe writes. */
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

/** Apply endpointListings rows with replay-safe writes. */
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

/** Apply endpointsPricing rows with replay-safe writes. */
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
  args: { ...cursorArgs, rows: v.array(endpointsStatsTable.validator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await shouldApply(ctx, args))) {
      return null
    }

    for (const row of args.rows) {
      await ctx.db.insert(V3_ENDPOINTS_STATS_SERIES_TABLE, row)
    }
    await ctx.db.insert(V3_SCAN_INGESTIONS_TABLE, {
      from_artifact_id: args.fromArtifactId,
      to_artifact_id: args.toArtifactId,
    })
    return null
  },
})
