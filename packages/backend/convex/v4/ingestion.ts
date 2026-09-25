import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { env, internalAction, internalMutation, query } from '../_generated/server'
import type { ActionCtx } from '../_generated/server'
import * as endpoints from './catalog/endpoints'
import * as models from './catalog/models'
import * as providers from './catalog/providers'
import * as listings from './history/listings'
import * as prices from './history/pricing'
import * as stats from './history/stats'
import { currentScanAt } from './ingestion/clock'
import { remainingSteps } from './ingestion/plan'
import * as state from './ingestion/state'
import { ingestionsTable, V4_INGESTIONS_TABLE } from './ingestion/table'
import type { Ingestion } from './ingestion/table'
import { loadPair } from './scan'

/** Process one pair; its final commit schedules the next action until caught up or blocked. */
export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ingestion = await ctx.runMutation(internal.v4.ingestion.claimNext, {})
    if (ingestion !== null) {
      await processIngestion(ctx, ingestion)
    }
    return null
  },
})

/** Prepare a chosen initial/connected pair and start the ordinary drain. */
export const start = internalMutation({
  args: ingestionsTable.validator.pick('from_scan_at', 'scan_at').fields,
  returns: v.null(),
  handler: async (ctx, pair) => {
    await state.createReadyIngestion(ctx, pair)
    await ctx.scheduler.runAfter(0, internal.v4.ingestion.run, {})
    return null
  },
})

const steps = [
  { name: 'stats', process: stats.process },
  { name: 'prices', process: prices.process },
  { name: 'listings', process: listings.process },
  { name: 'models', process: models.process },
  { name: 'providers', process: providers.process },
  { name: 'endpoints', process: endpoints.process },
]

/** Opt-in hourly ingestion, independent of V3 and scan capture. Manual runs are always available. */
export const scheduled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_V4_INGEST_ENABLED === 'true') {
      await ctx.scheduler.runAfter(0, internal.v4.ingestion.run, {})
    }
    return null
  },
})

async function processIngestion(ctx: ActionCtx, ingestion: Ingestion): Promise<void> {
  try {
    const observations = await loadPair(ctx, ingestion)
    const plan = remainingSteps(steps, ingestion, observations)

    for (const step of plan) {
      await step.process(ctx, step.observations, step.execution)
    }
  } finally {
    await ctx.runMutation(internal.v4.ingestion.finishAttempt, { id: ingestion.id })
  }
}

/** Read the completed observation clock. */
export const current = query({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx) => await currentScanAt(ctx),
})

/** Atomically claim ready work or discover and claim the next pair. */
export const claimNext = internalMutation({
  args: {},
  returns: v.union(v.null(), ingestionsTable.validator.extend({ id: v.id(V4_INGESTIONS_TABLE) })),
  handler: async (ctx): Promise<Ingestion | null> => await state.claimNext(ctx),
})

/** Preserve committed progress when an attempt exits. */
export const finishAttempt = internalMutation({
  args: { id: v.id(V4_INGESTIONS_TABLE) },
  returns: v.null(),
  handler: async (ctx, { id }) => await state.finishAttempt(ctx, id),
})
