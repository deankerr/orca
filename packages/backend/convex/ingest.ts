import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import { z } from 'zod'

import { internal } from '#generated/api'
import { env, internalAction, internalMutation } from '#generated/server'
import * as scans from '#scan'

import * as endpoints from './catalog/endpoints/ingest'
import { currentEndpointsTable } from './catalog/endpoints/table'
import * as models from './catalog/models/ingest'
import { currentModelsTable } from './catalog/models/table'
import * as providers from './catalog/providers/ingest'
import { currentProvidersTable } from './catalog/providers/table'
import * as stats from './catalog/stats/ingest'
import { currentStatsTable } from './catalog/stats/table'
import * as events from './events/ingest'
import * as listings from './history/listings/ingest'
import { endpointListingsTable } from './history/listings/table'
import * as pricing from './history/pricing/ingest'
import { endpointPricesTable } from './history/pricing/table'
import { initializeBaseline } from './ingestion/baseline'
import { release, createWork } from './ingestion/release'
import { ingestionsTable } from './ingestion/table'
import { workId } from './ingestion/work'

const acceptedWork = v.object({ events: workId })

/** Accept consecutive pairs with complete Catalog, Listings and Pricing before running Events. */
export const run = internalAction({
  args: { start_at: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scanAt = await ctx.runQuery(internal.clock.get, {})

    if (scanAt !== null && args.start_at !== undefined) {
      throw new ConvexError('start_at requires a fresh timeline; omit it to resume')
    }

    const from =
      args.start_at === undefined
        ? scanAt
        : z
            .union([z.iso.date(), z.iso.datetime({ offset: true })])
            .transform((value) => new Date(value).toISOString())
            .parse(args.start_at)

    const pair = await scans.reader(ctx).loadNextPair({ atOrAfter: from })

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
      listings: listings.prepare(pair),
      pricing: pricing.prepare(pair),
      stats: stats.prepare(pair.next.endpoints.values()),
    }

    console.log('[ingestion] prepared', {
      scan_at: pair.next.scan_at,
      models: output.models.length,
      providers: output.providers.length,
      endpoints: output.endpoints.length,
      listings: output.listings.length,
      pricing: output.pricing.length,
      stats: output.stats.length,
      argumentLength: JSON.stringify(output).length,
    })

    if (scanAt === null) {
      await initializeBaseline(ctx, pair.previous)
    }

    const work: Infer<typeof acceptedWork> | null = await ctx.runMutation(
      internal.ingest.commitIngestion,
      {
        from_scan_at: pair.previous.scan_at,
        scan_at: pair.next.scan_at,
        ...output,
      },
    )

    if (work === null) {
      return null
    }

    // Acceptance already committed; event failures leave their work pending.
    try {
      await events.process(ctx, pair, work.events)
    } catch (error: unknown) {
      console.error('[events] processing failed', {
        work_id: work.events,
        error,
      })
    }

    await ctx.scheduler.runAfter(0, internal.ingest.run, {})
    return null
  },
})

/** Accept Catalog, Listings and Pricing atomically; the action owns event attempts. */
export const commitIngestion = internalMutation({
  args: {
    ...ingestionsTable.validator.fields,
    models: v.array(currentModelsTable.validator),
    providers: v.array(currentProvidersTable.validator),
    endpoints: v.array(currentEndpointsTable.validator),
    listings: v.array(endpointListingsTable.validator),
    pricing: v.array(endpointPricesTable.validator),
    stats: currentStatsTable.validator.fields.rows,
  },
  returns: v.union(v.null(), acceptedWork),
  handler: async (ctx, args) => {
    if (args.listings.some((row) => row.scan_at !== args.scan_at)) {
      throw new ConvexError('Listing output does not match its ingestion')
    }

    if (args.pricing.some((row) => row.scan_at !== args.scan_at)) {
      throw new ConvexError('Pricing output does not match its ingestion')
    }

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
    await stats.write(ctx, args.scan_at, args.stats)
    await listings.write(ctx, args.listings)
    await pricing.write(ctx, args.pricing)

    const eventsWork = await createWork(ctx, ingestionId, 'events')

    return { events: eventsWork }
  },
})

/** Cron admission only; already-scheduled work and manual runs proceed independently. */
export const scheduled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_INGESTION_CRON_ENABLED === 'true') {
      await ctx.scheduler.runAfter(0, internal.ingest.run, {})
    }

    return null
  },
})
