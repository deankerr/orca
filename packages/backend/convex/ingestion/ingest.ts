import { v } from 'convex/values'

import { internal } from '#generated/api'
import type { Doc } from '#generated/dataModel'
import { internalAction } from '#generated/server'
import * as scans from '#scans'

import * as currentEndpoints from './currentEndpoints'
import * as currentModels from './currentModels'
import * as currentProviders from './currentProviders'
import * as currentStats from './currentStats'
import * as events from './events'
import type { ScanPair } from './input'
import * as observations from './observations'
import * as pricingHistory from './pricingHistory'
import * as statsHistory from './statsHistory'
import { REGISTRATIONS_TABLE, ingestionProcesses } from './table'

const processes = {
  currentModels: currentModels.ingest,
  currentProviders: currentProviders.ingest,
  currentEndpoints: currentEndpoints.ingest,
  currentStats: currentStats.ingest,
  observations: observations.ingest,
  pricingHistory: pricingHistory.ingest,
  statsHistory: statsHistory.ingest,
  events: events.ingest,
}

/** Only Workpool calls this action. Retries load the same input and run only unfinished processes. */
export const run = internalAction({
  args: { registration_id: v.id(REGISTRATIONS_TABLE) },
  returns: v.null(),
  handler: async (ctx, { registration_id }) => {
    const registration: Doc<typeof REGISTRATIONS_TABLE> | null = await ctx.runQuery(
      internal.ingestion.state.get,
      { registration_id },
    )

    if (registration === null || registration.progress.kind === 'complete') {
      return null
    }

    const { completed } = registration.progress
    const remaining = ingestionProcesses.filter((key) => !completed.includes(key))

    const [previous, next] = await Promise.all([
      registration.from_scan_at === null ? null : scans.load(ctx, registration.from_scan_at),
      scans.load(ctx, registration.scan_at),
    ])

    const pair: ScanPair = {
      previous: previous ?? {
        scan_at: null,
        models: new Map(),
        providers: new Map(),
        endpoints: new Map(),
        stats: [],
      },
      next,
    }

    const results = await Promise.allSettled(
      remaining.map(async (key) => {
        await processes[key](ctx, pair, registration_id)
      }),
    )
    const failure = results.find((result) => result.status === 'rejected')

    if (failure !== undefined) {
      throw failure.reason
    }

    return null
  },
})
