import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import type { ScanComparison } from '../projections'
import { planViewWrites } from './writes'
import type { ScanProjectionWrite } from './writes'

/** Consume shared comparison inputs in the ingestion action. */
export async function consume(ctx: Pick<ActionCtx, 'runMutation'>, comparison: ScanComparison) {
  await applyViewWrites(ctx, {
    fromArtifactId: comparison.previous.id,
    toArtifactId: comparison.next.id,
    scan_at: comparison.next.scan_at,
    writes: planViewWrites(comparison),
  })
}

/** Apply each table atomically; stats and the ingestion cursor commit last. */
export async function applyViewWrites(
  ctx: Pick<ActionCtx, 'runMutation'>,
  args: {
    fromArtifactId: string
    toArtifactId: string
    scan_at: string
    writes: ScanProjectionWrite[]
  },
) {
  const { writes, ...cursor } = args
  console.log({ ...cursor, writes: writes.length })
  const modelsRows = writes.filter((write) => write.table === 'models').map((write) => write.row)
  if (modelsRows.length > 0) {
    await ctx.runMutation(internal.views.apply.models, { rows: modelsRows })
  }
  const providersRows = writes
    .filter((write) => write.table === 'providers')
    .map((write) => write.row)
  if (providersRows.length > 0) {
    await ctx.runMutation(internal.views.apply.providers, { rows: providersRows })
  }
  const endpointsRows = writes
    .filter((write) => write.table === 'endpoints')
    .map((write) => write.row)
  if (endpointsRows.length > 0) {
    await ctx.runMutation(internal.views.apply.endpoints, { rows: endpointsRows })
  }
  const listingRows = writes
    .filter((write) => write.table === 'endpointListings')
    .map((write) => write.row)
  if (listingRows.length > 0) {
    await ctx.runMutation(internal.views.apply.endpointListings, { rows: listingRows })
  }
  const pricingRows = writes
    .filter((write) => write.table === 'endpointsPricing')
    .map((write) => write.row)
  if (pricingRows.length > 0) {
    await ctx.runMutation(internal.views.apply.endpointsPricing, { rows: pricingRows })
  }
  const statsRows = writes.filter((write) => write.table === 'stats').map((write) => write.row)
  await ctx.runMutation(internal.views.apply.stats, { ...cursor, rows: statsRows })
}
