import { ConvexError, v } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalMutation } from '../../_generated/server'
import type { ActionCtx, MutationCtx } from '../../_generated/server'
import { projectEndpoints, projectModel, projectProvider } from '../catalog/project'
import {
  currentEndpointsTable,
  currentModelsTable,
  currentProvidersTable,
  V4_CURRENT_ENDPOINTS_TABLE,
  V4_CURRENT_MODELS_TABLE,
  V4_CURRENT_PROVIDERS_TABLE,
} from '../catalog/table'
import * as listings from '../history/listings'
import * as pricing from '../history/pricing'
import {
  endpointListingsTable,
  endpointPricesTable,
  V4_ENDPOINT_LISTINGS_TABLE,
  V4_ENDPOINT_PRICES_TABLE,
} from '../history/table'
import type { Scan } from '../scan'
import { ingestionScanAt } from './clock'

/**
 * Once per fresh deployment, before its first real ingestion. Each table is inserted separately.
 * No checkpoints or recovery: a partial bootstrap needs investigation/reset, not automatic retry.
 * The caller waits for two artifacts to exist, but only the first observation seeds these tables.
 */
export async function bootstrap(ctx: ActionCtx, scan: Scan) {
  const models = new Map(
    [...scan.models].map(([id, model]) => [id, projectModel(model, scan.scan_at)]),
  )

  const providers = [...scan.providers.values()].map((provider) =>
    projectProvider(provider, scan.scan_at),
  )

  const endpoints = [...projectEndpoints(scan, models).values()]
  const prices = pricing.initialRows(scan)
  const listed = listings.initialRows(scan)

  console.log('[v4:bootstrap] prepared', {
    scan_at: scan.scan_at,
    models: models.size,
    providers: providers.length,
    endpoints: endpoints.length,
    prices: prices.length,
    listings: listed.length,
  })

  await ctx.runMutation(internal.v4.ingestion.bootstrap.insertModels, {
    rows: [...models.values()],
  })

  await ctx.runMutation(internal.v4.ingestion.bootstrap.insertProviders, { rows: providers })
  await ctx.runMutation(internal.v4.ingestion.bootstrap.insertEndpoints, { rows: endpoints })
  await ctx.runMutation(internal.v4.ingestion.bootstrap.insertPrices, { rows: prices })
  await ctx.runMutation(internal.v4.ingestion.bootstrap.insertListings, { rows: listed })
}

type BootstrapTable =
  | typeof V4_CURRENT_MODELS_TABLE
  | typeof V4_CURRENT_PROVIDERS_TABLE
  | typeof V4_CURRENT_ENDPOINTS_TABLE
  | typeof V4_ENDPOINT_PRICES_TABLE
  | typeof V4_ENDPOINT_LISTINGS_TABLE

/** Empty-table check also prevents concurrent bootstrap attempts from inserting duplicates. */
async function assertEmpty(ctx: MutationCtx, table: BootstrapTable) {
  if ((await ingestionScanAt(ctx)) !== null || (await ctx.db.query(table).first()) !== null) {
    throw new ConvexError({
      message: 'Bootstrap requires empty tables; inspect/reset partial initialization',
      table,
    })
  }
}

/** Bootstrap transaction step, not a standalone operator command. */
export const insertModels = internalMutation({
  args: { rows: v.array(currentModelsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    console.log('[v4:bootstrap] models', { inserts: rows.length })
    await assertEmpty(ctx, V4_CURRENT_MODELS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(V4_CURRENT_MODELS_TABLE, row)
    }
    return null
  },
})

/** Bootstrap transaction step, not a standalone operator command. */
export const insertProviders = internalMutation({
  args: { rows: v.array(currentProvidersTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    console.log('[v4:bootstrap] providers', { inserts: rows.length })
    await assertEmpty(ctx, V4_CURRENT_PROVIDERS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(V4_CURRENT_PROVIDERS_TABLE, row)
    }
    return null
  },
})

/** Bootstrap transaction step, not a standalone operator command. */
export const insertEndpoints = internalMutation({
  args: { rows: v.array(currentEndpointsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    console.log('[v4:bootstrap] endpoints', { inserts: rows.length })
    await assertEmpty(ctx, V4_CURRENT_ENDPOINTS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(V4_CURRENT_ENDPOINTS_TABLE, row)
    }
    return null
  },
})

/** Bootstrap transaction step; history processors own first-observation row selection. */
export const insertPrices = internalMutation({
  args: { rows: v.array(endpointPricesTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    console.log('[v4:bootstrap] prices', { inserts: rows.length })
    await assertEmpty(ctx, V4_ENDPOINT_PRICES_TABLE)
    for (const row of rows) {
      await ctx.db.insert(V4_ENDPOINT_PRICES_TABLE, row)
    }
    return null
  },
})

/** Bootstrap transaction step; history processors own first-observation row selection. */
export const insertListings = internalMutation({
  args: { rows: v.array(endpointListingsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    console.log('[v4:bootstrap] listings', { inserts: rows.length })
    await assertEmpty(ctx, V4_ENDPOINT_LISTINGS_TABLE)
    for (const row of rows) {
      await ctx.db.insert(V4_ENDPOINT_LISTINGS_TABLE, row)
    }
    return null
  },
})
