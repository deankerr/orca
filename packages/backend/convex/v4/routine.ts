import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '../_generated/api'
import { env, internalAction, internalMutation } from '../_generated/server'
import * as endpoints from './catalog/endpoints/ingest'
import { currentEndpointsTable } from './catalog/endpoints/table'
import * as models from './catalog/models/ingest'
import { currentModelsTable } from './catalog/models/table'
import * as providers from './catalog/providers/ingest'
import { currentProvidersTable } from './catalog/providers/table'
import * as listings from './history/listings/ingest'
import * as pricing from './history/pricing/ingest'
import { release, createWork } from './ingestion/release'
import { workId } from './ingestion/work'
import { initialize } from './initialize'
import { loadNextPair } from './scan/load'
import { pairTimes } from './scan/time'
import * as stats from './stats/ingest'

const acceptedWork = v.object({ pricing: workId, listings: workId })

/** Release consecutive pairs; only Catalog is a prerequisite for accepting each pair. */
export const run = internalAction({
  args: { start_at: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scanAt = await ctx.runQuery(internal.v4.clock.get, {})
    if (scanAt !== null && args.start_at !== undefined) {
      throw new ConvexError('start_at requires a fresh V4 timeline; omit it to resume')
    }
    const pair = await loadNextPair(ctx, scanAt ?? args.start_at ?? null)
    if (pair === null) {
      if (args.start_at !== undefined) {
        throw new ConvexError({
          message: 'Baseline requires two captures at or after start_at; retry when available',
          start_at: args.start_at,
        })
      }
      return null
    }

    const output = {
      models: models.prepare(pair),
      providers: providers.prepare(pair),
      endpoints: endpoints.prepare(pair),
    }
    console.log('[v4:ingestion] prepared', {
      scan_at: pair.next.scan_at,
      models: output.models.length,
      providers: output.providers.length,
      endpoints: output.endpoints.length,
      argumentLength: JSON.stringify(output).length,
    })

    if (scanAt === null) {
      await initialize(ctx, pair.previous)
    }

    const work: Infer<typeof acceptedWork> | null = await ctx.runMutation(
      internal.v4.routine.commitIngestion,
      {
        from_scan_at: pair.previous.scan_at,
        scan_at: pair.next.scan_at,
        ...output,
      },
    )
    if (work === null) {
      return null
    }

    // Acceptance already committed. Each attempt reuses this pair and fails independently.
    try {
      await pricing.process(ctx, pair, work.pricing)
    } catch (error: unknown) {
      console.error('[v4:pricing] failed; work remains pending', { work_id: work.pricing, error })
    }

    try {
      await listings.process(ctx, pair, work.listings)
    } catch (error: unknown) {
      console.error('[v4:listings] failed; work remains pending', { work_id: work.listings, error })
    }

    try {
      await stats.process(ctx, pair.next.scan_at, pair.next.endpoints.values())
    } catch (error: unknown) {
      console.error('[v4:current-stats] failed; previous publication retained', {
        scan_at: pair.next.scan_at,
        error,
      })
    }

    await ctx.scheduler.runAfter(0, internal.v4.routine.run, {})
    return null
  },
})

/** Accept Catalog and declare every History obligation atomically; the action owns the attempts. */
export const commitIngestion = internalMutation({
  args: {
    ...pairTimes.fields,
    models: v.array(currentModelsTable.validator),
    providers: v.array(currentProvidersTable.validator),
    endpoints: v.array(currentEndpointsTable.validator),
  },
  returns: v.union(v.null(), acceptedWork),
  handler: async (ctx, args) => {
    const ingestionId = await release(ctx, {
      from_scan_at: args.from_scan_at,
      scan_at: args.scan_at,
    })
    if (ingestionId === null) {
      return null
    }

    await models.write(ctx, args.models)
    await providers.write(ctx, args.providers)
    await endpoints.write(ctx, args.endpoints)

    const pricingWork = await createWork(ctx, ingestionId, 'pricing')
    const listingsWork = await createWork(ctx, ingestionId, 'listings')
    return { pricing: pricingWork, listings: listingsWork }
  },
})

/** Cron admission only; already-scheduled work and manual runs proceed independently. */
export const scheduled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_V4_INGEST_CRON_ENABLED === 'true') {
      await ctx.scheduler.runAfter(0, internal.v4.routine.run, {})
    }
    return null
  },
})
