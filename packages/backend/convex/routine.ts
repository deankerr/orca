import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import { z } from 'zod'

import { internal } from './_generated/api'
import { env, internalAction, internalMutation } from './_generated/server'
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
import { release, createWork } from './ingestion/release'
import { ingestionsTable } from './ingestion/table'
import { workId } from './ingestion/work'
import { initialize } from './initialize'
import { loadNextPair } from './scan'

const acceptedWork = v.object({ pricing: workId, events: workId })

/** Accept consecutive pairs with complete Catalog and Listings before running processors. */
export const run = internalAction({
  args: { start_at: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scanAt = await ctx.runQuery(internal.clock.get, {})

    if (scanAt !== null && args.start_at !== undefined) {
      throw new ConvexError('start_at requires a fresh V4 timeline; omit it to resume')
    }

    const from =
      args.start_at === undefined
        ? scanAt
        : z
            .union([z.iso.date(), z.iso.datetime({ offset: true })])
            .transform((value) => new Date(value).toISOString())
            .parse(args.start_at)

    const pair = await loadNextPair(ctx, from)

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
      stats: stats.prepare(pair.next.endpoints.values()),
    }

    console.log('[v4:ingestion] prepared', {
      scan_at: pair.next.scan_at,
      models: output.models.length,
      providers: output.providers.length,
      endpoints: output.endpoints.length,
      listings: output.listings.length,
      stats: output.stats.length,
      argumentLength: JSON.stringify(output).length,
    })

    if (scanAt === null) {
      await initialize(ctx, pair.previous)
    }

    const work: Infer<typeof acceptedWork> | null = await ctx.runMutation(
      internal.routine.commitIngestion,
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
      const eventIds = await events.process(ctx, pair, work.events)

      if (env.ORCA_DISCORD_ALERTS_ENABLED === 'true' && eventIds.length > 0) {
        // Scheduling is best-effort after commit; retries deliberately do not broadcast.
        await ctx.scheduler.runAfter(0, internal.alerts.discord.delivery.broadcast, {
          event_ids: eventIds,
        })
      }
    } catch (error: unknown) {
      console.error('[events] processing or Discord scheduling failed', {
        work_id: work.events,
        error,
      })
    }

    await ctx.scheduler.runAfter(0, internal.routine.run, {})
    return null
  },
})

/** Accept Catalog and Listings atomically; the action owns processor attempts. */
export const commitIngestion = internalMutation({
  args: {
    ...ingestionsTable.validator.fields,
    models: v.array(currentModelsTable.validator),
    providers: v.array(currentProvidersTable.validator),
    endpoints: v.array(currentEndpointsTable.validator),
    listings: v.array(endpointListingsTable.validator),
    stats: currentStatsTable.validator.fields.rows,
  },
  returns: v.union(v.null(), acceptedWork),
  handler: async (ctx, args) => {
    if (args.listings.some((row) => row.scan_at !== args.scan_at)) {
      throw new ConvexError('Listing output does not match its ingestion')
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

    const pricingWork = await createWork(ctx, ingestionId, 'pricing')

    const eventsWork = await createWork(ctx, ingestionId, 'events')

    return { pricing: pricingWork, events: eventsWork }
  },
})

/** Cron admission only; already-scheduled work and manual runs proceed independently. */
export const scheduled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_V4_INGEST_CRON_ENABLED === 'true') {
      await ctx.scheduler.runAfter(0, internal.routine.run, {})
    }

    return null
  },
})
