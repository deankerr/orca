import { v } from 'convex/values'

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

/** Load and retain the first available pair. Pair advancement belongs to future orchestration. */
export const run = internalAction({
  args: {},
  returns: v.union(v.null(), v.object({ from_scan_at: v.string(), scan_at: v.string() })),
  handler: async (ctx) => {
    const scanPair = await scans.reader(ctx).loadNextPair()

    if (scanPair === null) {
      return null
    }

    await currentModels.ingest(ctx, scanPair)
    await currentProviders.ingest(ctx, scanPair)
    await currentEndpoints.ingest(ctx, scanPair)
    await currentStats.ingest(ctx, scanPair)
    await listingHistory.ingest(ctx, scanPair)
    await pricingHistory.ingest(ctx, scanPair)
    await statsHistory.ingest(ctx, scanPair)
    await events.ingest(ctx, scanPair)

    return { from_scan_at: scanPair.previous.scan_at, scan_at: scanPair.next.scan_at }
  },
})
