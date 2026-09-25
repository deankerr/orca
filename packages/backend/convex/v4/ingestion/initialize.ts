import { v, ConvexError } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction, internalMutation } from '../../_generated/server'
import * as endpoints from '../catalog/endpoints'
import * as models from '../catalog/models'
import * as providers from '../catalog/providers'
import { currentEndpointsTable, currentModelsTable, currentProvidersTable } from '../catalog/table'
import { loadPair, nextPair } from '../scan'
import { assertUninitialized, declarePair } from './state'
import { logCatalog } from './step'
import { ingestionsTable } from './table'

/**
 * Manual, non-routine initialization from the first two artifacts, once per deployment.
 * Deliberately non-resumable: table writes commit separately without saved progress.
 * On failure rerun from the beginning; writes replace by identity. Declaration comes last.
 * This initializes only Catalog; start each following module separately afterward.
 */
export const initializeCatalog = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if ((await ctx.runQuery(internal.v4.ingestion.progress.getCatalogScanAt, {})) !== null) {
      throw new ConvexError('Catalog is already initialized')
    }
    const pair = await nextPair(ctx, null)
    if (pair === null) {
      throw new ConvexError('Initialization needs two scan artifacts')
    }
    const loaded = await loadPair(ctx, pair)
    const catalog = {
      ...pair,
      models: models.prepare(loaded, { baseline: true }),
      providers: providers.prepare(loaded, { baseline: true }),
      endpoints: endpoints.prepare(loaded, { baseline: true }),
    }
    logCatalog('initialize', catalog, JSON.stringify(catalog).length)
    await ctx.runMutation(internal.v4.ingestion.initialize.writeInitialModels, {
      rows: catalog.models,
    })
    await ctx.runMutation(internal.v4.ingestion.initialize.writeInitialProviders, {
      rows: catalog.providers,
    })
    await ctx.runMutation(internal.v4.ingestion.initialize.writeInitialEndpoints, {
      rows: catalog.endpoints,
    })
    await ctx.runMutation(internal.v4.ingestion.initialize.declareInitialPair, pair)
    return null
  },
})

/** Transaction step for initializeCatalog; not a standalone initialization command. */
export const writeInitialModels = internalMutation({
  args: { rows: v.array(currentModelsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    console.log('[v4:catalog] initialize models', { rows: rows.length })
    await assertUninitialized(ctx)
    await models.write(ctx, rows)
    return null
  },
})

/** Transaction step for initializeCatalog; not a standalone initialization command. */
export const writeInitialProviders = internalMutation({
  args: { rows: v.array(currentProvidersTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    console.log('[v4:catalog] initialize providers', { rows: rows.length })
    await assertUninitialized(ctx)
    await providers.write(ctx, rows)
    return null
  },
})

/** Transaction step for initializeCatalog; not a standalone initialization command. */
export const writeInitialEndpoints = internalMutation({
  args: { rows: v.array(currentEndpointsTable.validator) },
  returns: v.null(),
  handler: async (ctx, { rows }) => {
    console.log('[v4:catalog] initialize endpoints', { rows: rows.length })
    await assertUninitialized(ctx)
    await endpoints.write(ctx, rows)
    return null
  },
})

/** Final transaction step for initializeCatalog, after all three table writes succeed. */
export const declareInitialPair = internalMutation({
  args: ingestionsTable.validator.fields,
  returns: v.null(),
  handler: async (ctx, pair) => {
    console.log('[v4:catalog] declare initial pair', { ...pair, inserts: 1 })
    await declarePair(ctx, pair, { baseline: true })
    return null
  },
})
