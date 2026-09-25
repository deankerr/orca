import { v, ConvexError } from 'convex/values'

import { internal } from '../../_generated/api'
import { env, internalAction, internalMutation } from '../../_generated/server'
import { nextScanAt } from '../../scan/artifact'
import * as endpoints from '../catalog/endpoints'
import * as models from '../catalog/models'
import * as providers from '../catalog/providers'
import { currentEndpointsTable, currentModelsTable, currentProvidersTable } from '../catalog/table'
import { loadPair, nextPair } from '../scan'
import { getModule } from './registry'
import { declarePair } from './state'
import { logCatalog } from './step'
import { ingestionsTable } from './table'

/**
 * Manual entry point: drain available artifacts, one pair per scheduled action.
 * Catalog commits first; current modules share the loaded pair and fail independently.
 * Behind modules need manual catch-up. This also runs when cron admission is disabled.
 */
export const drainArtifacts = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const clock = await ctx.runQuery(internal.v4.ingestion.progress.getCatalogScanAt, {})
    if (clock === null) {
      throw new ConvexError('Catalog is not initialized')
    }
    const pair = await nextPair(ctx, clock)
    if (pair === null) {
      return null
    }
    const loaded = await loadPair(ctx, pair)
    const catalog = {
      ...pair,
      models: models.prepare(loaded, { baseline: false }),
      providers: providers.prepare(loaded, { baseline: false }),
      endpoints: endpoints.prepare(loaded, { baseline: false }),
    }
    logCatalog('prepared', catalog, JSON.stringify(catalog).length)
    await ctx.runMutation(internal.v4.ingestion.routine.commitCatalogPair, catalog)

    const cursors = await ctx.runQuery(internal.v4.ingestion.progress.listModuleCursors, {})
    const current = cursors.filter((cursor) => cursor.scan_at === pair.from_scan_at)
    await Promise.all(
      current.map(async ({ module }) => {
        try {
          await getModule(module).process(ctx, loaded, {
            module,
            cursor: pair.from_scan_at,
            scan_at: pair.scan_at,
          })
        } catch (error: unknown) {
          // A failed module falls behind; its catch-up loop is started manually.
          console.error('[v4:ingestion] module failed', { module, ...pair, error })
        }
      }),
    )
    if ((await nextScanAt(ctx, pair.scan_at)) !== null) {
      await ctx.scheduler.runAfter(0, internal.v4.ingestion.routine.drainArtifacts, {})
    }
    return null
  },
})

/** Transaction step for drainArtifacts: declare the pair and commit Catalog writes atomically. */
export const commitCatalogPair = internalMutation({
  args: {
    ...ingestionsTable.validator.fields,
    models: v.array(currentModelsTable.validator),
    providers: v.array(currentProvidersTable.validator),
    endpoints: v.array(currentEndpointsTable.validator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    logCatalog('commit pair', args)
    await declarePair(
      ctx,
      { from_scan_at: args.from_scan_at, scan_at: args.scan_at },
      { baseline: false },
    )
    await models.write(ctx, args.models)
    await providers.write(ctx, args.providers)
    await endpoints.write(ctx, args.endpoints)
    return null
  },
})

/** Cron hook: the flag admits a drain; disabling it does not stop an existing chain. */
export const scheduleIfEnabled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_V4_INGEST_ENABLED === 'true') {
      await ctx.scheduler.runAfter(0, internal.v4.ingestion.routine.drainArtifacts, {})
    }
    return null
  },
})
