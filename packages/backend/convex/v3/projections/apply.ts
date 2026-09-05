import { getConvexSize, v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { ActionCtx } from '../../_generated/server'
import {
  V3_ENDPOINTS_VIEW_TABLE,
  V3_MODELS_VIEW_TABLE,
  V3_PROVIDERS_VIEW_TABLE,
} from '../entities.table'
import { INITIAL_SCAN_ARTIFACT_ID, V3_SCAN_INGESTIONS_TABLE } from '../ingestions.table'
import {
  V3_ENDPOINTS_LISTING_SERIES_TABLE,
  V3_ENDPOINTS_PRICING_SERIES_TABLE,
  V3_ENDPOINTS_STATS_SERIES_TABLE,
} from '../series.table'
import { ScanProjectionWrite } from './diff'

export const MAX_BATCH_WRITES = 250
// Target size of projection writes; a larger individual write runs alone.
export const TARGET_BATCH_BYTES = 1024 * 1024

/** Apply bounded transactions; only the final batch advances the ledger. */
export async function applyScanProjection(
  ctx: Pick<ActionCtx, 'runMutation'>,
  args: { fromArtifactId: string; toArtifactId: string; writes: ScanProjectionWrite[] },
) {
  const batches = projectionWriteBatches(args.writes)
  console.log({
    fromArtifactId: args.fromArtifactId,
    toArtifactId: args.toArtifactId,
    writes: args.writes.length,
    batches: batches.length,
  })

  for (const [index, writes] of batches.entries()) {
    await ctx.runMutation(internal.v3.projections.apply.apply, {
      fromArtifactId: args.fromArtifactId,
      toArtifactId: args.toArtifactId,
      writes,
      complete: index === batches.length - 1,
    })
  }
}

/** Bound both database operations and payload size, preserving diff order. */
export function projectionWriteBatches(writes: ScanProjectionWrite[]) {
  const batches: ScanProjectionWrite[][] = []
  let batch: ScanProjectionWrite[] = []
  let bytes = 0

  for (const write of writes) {
    const size = getConvexSize(write)
    if (
      batch.length > 0 &&
      (batch.length >= MAX_BATCH_WRITES || bytes + size > TARGET_BATCH_BYTES)
    ) {
      batches.push(batch)
      batch = []
      bytes = 0
    }
    batch.push(write)
    bytes += size
  }

  // Even an empty diff must advance the ledger.
  batches.push(batch)
  return batches
}

/** Retry-safe batch, with the completed cursor checked in the same transaction. */
export const apply = internalMutation({
  args: {
    fromArtifactId: v.string(),
    toArtifactId: v.string(),
    writes: v.array(ScanProjectionWrite),
    complete: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const latest = await ctx.db.query(V3_SCAN_INGESTIONS_TABLE).order('desc').first()
    const current = latest?.to_artifact_id ?? INITIAL_SCAN_ARTIFACT_ID
    if (current === args.toArtifactId) {
      return null
    }
    if (current !== args.fromArtifactId) {
      throw new Error('Projection ingestion cursor changed')
    }

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

      const table =
        write.table === 'endpointListings'
          ? V3_ENDPOINTS_LISTING_SERIES_TABLE
          : write.table === 'endpointsPricing'
            ? V3_ENDPOINTS_PRICING_SERIES_TABLE
            : V3_ENDPOINTS_STATS_SERIES_TABLE
      const existing = await ctx.db
        .query(table)
        .withIndex('by_endpoint_id_and_scan_at', (q) =>
          q.eq('endpoint_id', write.row.endpoint_id).eq('scan_at', write.row.scan_at),
        )
        .unique()
      if (existing === null) {
        await ctx.db.insert(table, write.row)
      }
    }

    if (args.complete) {
      await ctx.db.insert(V3_SCAN_INGESTIONS_TABLE, {
        from_artifact_id: args.fromArtifactId,
        to_artifact_id: args.toArtifactId,
      })
    }

    return null
  },
})
