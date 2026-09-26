import { internal } from '../_generated/api'
import type { ActionCtx } from '../_generated/server'
import * as endpoints from './catalog/endpoints/ingest'
import * as models from './catalog/models/ingest'
import * as providers from './catalog/providers/ingest'
import * as listings from './history/listings/ingest'
import * as pricing from './history/pricing/ingest'
import type { Scan } from './scan/extract'

/** One-time composition before the first real ingestion; partial failure requires investigation/reset. */
export async function initialize(ctx: ActionCtx, baseline: Scan) {
  const modelRows = models.initialRows(baseline)
  const providerRows = providers.initialRows(baseline)
  const endpointRows = endpoints.initialRows(baseline)
  const priceRows = pricing.initialRows(baseline)
  const listingRows = listings.initialRows(baseline)

  console.log('[v4:initialize] prepared', {
    scan_at: baseline.scan_at,
    models: modelRows.length,
    providers: providerRows.length,
    endpoints: endpointRows.length,
    prices: priceRows.length,
    listings: listingRows.length,
  })

  await ctx.runMutation(internal.v4.catalog.models.ingest.initialize, { rows: modelRows })
  await ctx.runMutation(internal.v4.catalog.providers.ingest.initialize, { rows: providerRows })
  await ctx.runMutation(internal.v4.catalog.endpoints.ingest.initialize, { rows: endpointRows })
  await ctx.runMutation(internal.v4.history.pricing.ingest.initialize, { rows: priceRows })
  await ctx.runMutation(internal.v4.history.listings.ingest.initialize, { rows: listingRows })
}
