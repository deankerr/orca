import { ConvexError, v } from 'convex/values'
import { z } from 'zod'

import { internal } from '#generated/api'
import type { Doc, Id } from '#generated/dataModel'
import { env, internalAction, internalMutation } from '#generated/server'
import * as scans from '#scanNew'

import * as currentEndpoints from './currentEndpoints'
import * as currentModels from './currentModels'
import * as currentProviders from './currentProviders'
import * as currentStats from './currentStats'
import * as events from './events'
import * as listingHistory from './listingHistory'
import * as observations from './observations'
import * as pricingHistory from './pricingHistory'
import * as statsHistory from './statsHistory'
import { INGESTIONS_TABLE, ingestKeys } from './table'

/** Choose a baseline on a fresh timeline; otherwise resume before discovering the next input. */
export const enqueueNextInput = internalAction({
  args: { start_at: v.optional(v.string()) },
  returns: v.union(v.null(), v.id(INGESTIONS_TABLE)),
  handler: async (ctx, { start_at }): Promise<Id<typeof INGESTIONS_TABLE> | null> => {
    const latest: Doc<typeof INGESTIONS_TABLE> | null = await ctx.runQuery(
      internal.ingestion.state.latest,
      {},
    )

    if (latest !== null && start_at !== undefined) {
      throw new ConvexError('start_at requires a fresh timeline; omit it to resume')
    }

    if (latest !== null && latest.progress.kind !== 'complete') {
      await ctx.runMutation(internal.ingestion.state.recover, {})
      return latest._id
    }

    const startAt =
      start_at === undefined
        ? null
        : z
            .union([z.iso.date(), z.iso.datetime({ offset: true })])
            .transform((value) => new Date(value).toISOString())
            .parse(start_at)
    const reader = scans.reader(ctx)
    const input =
      latest === null ? await reader.firstInput(startAt) : await reader.nextInput(latest.scan_at)

    if (input === null && startAt !== null) {
      throw new ConvexError({
        message: 'No baseline capture at or after start_at; retry when available',
        start_at: startAt,
      })
    }

    return input === null ? null : await ctx.runMutation(internal.ingestion.state.register, input)
  },
})

const ingests = {
  currentModels: currentModels.ingest,
  currentProviders: currentProviders.ingest,
  currentEndpoints: currentEndpoints.ingest,
  currentStats: currentStats.ingest,
  listingHistory: listingHistory.ingest,
  observations: observations.ingest,
  pricingHistory: pricingHistory.ingest,
  statsHistory: statsHistory.ingest,
  events: events.ingest,
}

/** Only Workpool calls this action. Retries load the same input and run only unfinished stages. */
export const ingestInput = internalAction({
  args: { ingestion_id: v.id(INGESTIONS_TABLE) },
  returns: v.null(),
  handler: async (ctx, { ingestion_id }) => {
    const ingestion: Doc<typeof INGESTIONS_TABLE> | null = await ctx.runQuery(
      internal.ingestion.state.get,
      { ingestion_id },
    )

    if (ingestion === null || ingestion.progress.kind === 'complete') {
      return null
    }

    const { completed } = ingestion.progress
    const remaining = ingestKeys.filter((key) => !completed.includes(key))

    const pair = await scans.reader(ctx).loadPair(ingestion)

    const results = await Promise.allSettled(
      remaining.map(async (key) => {
        await ingests[key](ctx, pair, ingestion_id)
      }),
    )
    const failure = results.find((result) => result.status === 'rejected')

    if (failure !== undefined) {
      throw failure.reason
    }

    return null
  },
})

/** Gate cron admission; manual invocations and continuations proceed independently. */
export const scheduled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_INGESTION_CRON_ENABLED === 'true') {
      await ctx.scheduler.runAfter(0, internal.ingestion.run.enqueueNextInput, {})
    }

    return null
  },
})
