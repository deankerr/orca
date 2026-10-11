import { v } from 'convex/values'

import { internal } from '#generated/api'
import type { Doc, Id } from '#generated/dataModel'
import { internalAction } from '#generated/server'
import * as scans from '#scanNew'

import * as currentEndpoints from './currentEndpoints'
import * as currentModels from './currentModels'
import * as currentProviders from './currentProviders'
import * as currentStats from './currentStats'
import * as events from './events'
import * as listingHistory from './listingHistory'
import * as pricingHistory from './pricingHistory'
import * as statsHistory from './statsHistory'
import { INGESTIONS_TABLE, ingestKeys } from './table'

/** Resume the registered input before discovering the next one. */
export const run = internalAction({
  args: {},
  returns: v.union(v.null(), v.id(INGESTIONS_TABLE)),
  handler: async (ctx): Promise<Id<typeof INGESTIONS_TABLE> | null> => {
    const latest: Doc<typeof INGESTIONS_TABLE> | null = await ctx.runQuery(
      internal.ingestionNew.state.latest,
      {},
    )

    if (latest !== null && latest.stage !== 'complete') {
      await ctx.runMutation(internal.ingestionNew.state.recover, {})
      return latest._id
    }

    const input = await scans.reader(ctx).nextInput(latest?.scan_at ?? null)

    return input === null
      ? null
      : await ctx.runMutation(internal.ingestionNew.state.register, input)
  },
})

const ingests = {
  currentModels: currentModels.ingest,
  currentProviders: currentProviders.ingest,
  currentEndpoints: currentEndpoints.ingest,
  currentStats: currentStats.ingest,
  listingHistory: listingHistory.ingest,
  pricingHistory: pricingHistory.ingest,
  statsHistory: statsHistory.ingest,
  events: events.ingest,
}

/** Only Workpool calls this action. A retry loads the same source input and committed prefix. */
export const apply = internalAction({
  args: { ingestion_id: v.id(INGESTIONS_TABLE) },
  returns: v.null(),
  handler: async (ctx, { ingestion_id }) => {
    const ingestion: Doc<typeof INGESTIONS_TABLE> | null = await ctx.runQuery(
      internal.ingestionNew.state.get,
      { ingestion_id },
    )

    if (ingestion === null || ingestion.stage === 'complete' || ingestion.work_id === undefined) {
      return null
    }

    const owner = { ingestion_id, work_id: ingestion.work_id }
    const remaining = ingestKeys.slice(
      ingestion.stage === null ? 0 : ingestKeys.indexOf(ingestion.stage) + 1,
    )

    if (remaining.length === 0) {
      return null
    }

    const pair = await scans.reader(ctx).loadPair(ingestion)

    for (const key of remaining) {
      await ingests[key](ctx, pair, owner)
    }

    return null
  },
})
