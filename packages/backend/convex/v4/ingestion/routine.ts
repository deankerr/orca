import { ConvexError, v } from 'convex/values'

import { internal } from '../../_generated/api'
import { env, internalAction, internalMutation } from '../../_generated/server'
import * as endpoints from '../catalog/endpoints'
import * as models from '../catalog/models'
import * as providers from '../catalog/providers'
import { currentEndpointsTable, currentModelsTable, currentProvidersTable } from '../catalog/table'
import { loadPair, nextPair } from '../scan'
import { assertScanPair } from '../scan/time'
import { bootstrap } from './bootstrap'
import { ingestionScanAt } from './clock'
import { activeProcessors } from './registry'
import { ingestionsTable, V4_INGESTIONS_TABLE, V4_PROCESSOR_WORK_TABLE } from './table'

/** Manual or scheduled: release one pair, without waiting for downstream processing. */
export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const clock = await ctx.runQuery(internal.v4.ingestion.progress.getIngestionScanAt, {})
    const pair = await nextPair(ctx, clock)

    if (pair === null) {
      return null
    }

    const loaded = await loadPair(ctx, pair)

    const catalog = {
      ...pair,
      models: models.prepare(loaded),
      providers: providers.prepare(loaded),
      endpoints: endpoints.prepare(loaded),
    }

    console.log('[v4:ingestion] prepared', {
      ...pair,
      models: catalog.models.length,
      providers: catalog.providers.length,
      endpoints: catalog.endpoints.length,
      argumentLength: JSON.stringify(catalog).length,
    })

    if (clock === null) {
      await bootstrap(ctx, loaded.previous)
    }

    await ctx.runMutation(internal.v4.ingestion.routine.commitIngestion, catalog)
    return null
  },
})

/** Catalog, release, processor obligations and initial scheduling are one transaction. */
export const commitIngestion = internalMutation({
  args: {
    ...ingestionsTable.validator.fields,
    models: v.array(currentModelsTable.validator),
    providers: v.array(currentProvidersTable.validator),
    endpoints: v.array(currentEndpointsTable.validator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    console.log('[v4:ingestion] commit', {
      scan_at: args.scan_at,
      models: args.models.length,
      providers: args.providers.length,
      endpoints: args.endpoints.length,
      work: activeProcessors.length,
    })

    assertScanPair(args.from_scan_at, args.scan_at)

    const existing = await ctx.db
      .query(V4_INGESTIONS_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', args.scan_at))
      .unique()

    if (existing !== null) {
      if (existing.from_scan_at !== args.from_scan_at) {
        throw new ConvexError('Ingestion pair does not match the released input')
      }

      return null
    }

    const clock = await ingestionScanAt(ctx)

    if (clock !== null && clock !== args.from_scan_at) {
      throw new ConvexError({ message: 'Pair does not follow the ingestion clock', clock })
    }

    await models.write(ctx, args.models)
    await providers.write(ctx, args.providers)
    await endpoints.write(ctx, args.endpoints)

    const ingestionId = await ctx.db.insert(V4_INGESTIONS_TABLE, {
      from_scan_at: args.from_scan_at,
      scan_at: args.scan_at,
    })
    for (const processor of activeProcessors) {
      await ctx.db.insert(V4_PROCESSOR_WORK_TABLE, {
        ingestion_id: ingestionId,
        processor,
        scan_at: args.scan_at,
        state: 'pending',
      })
    }
    await ctx.scheduler.runAfter(0, internal.v4.ingestion.processors.processIngestion, {
      ingestion_id: ingestionId,
    })

    await ctx.scheduler.runAfter(0, internal.v4.stats.current.refreshLatest, {})
    await ctx.scheduler.runAfter(0, internal.v4.ingestion.routine.run, {})
    return null
  },
})

/** Cron entry point: admit a run only when enabled; direct run calls bypass this gate. */
export const scheduled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_V4_INGEST_CRON_ENABLED === 'true') {
      await ctx.scheduler.runAfter(0, internal.v4.ingestion.routine.run, {})
    }

    return null
  },
})
