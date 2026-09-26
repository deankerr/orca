import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction } from '../_generated/server'
import * as listingHistory from './history/listings/ingest'
import * as pricingHistory from './history/pricing/ingest'
import { workId } from './ingestion/work'
import { loadPair } from './scan/load'

/** Manual recovery of a Pricing obligation; the routine supplies its already-loaded pair directly. */
export const pricing = internalAction({
  args: { work_id: workId },
  returns: v.null(),
  handler: async (ctx, args) => {
    const times = await ctx.runQuery(internal.v4.ingestion.work.getWorkInput, {
      ...args,
      processor: 'pricing',
    })
    if (times === null) {
      return null
    }
    await pricingHistory.process(ctx, await loadPair(ctx, times), args.work_id)
    return null
  },
})

/** Manual recovery of a Listings obligation, independently of other modules' work. */
export const listings = internalAction({
  args: { work_id: workId },
  returns: v.null(),
  handler: async (ctx, args) => {
    const times = await ctx.runQuery(internal.v4.ingestion.work.getWorkInput, {
      ...args,
      processor: 'listings',
    })
    if (times === null) {
      return null
    }
    await listingHistory.process(ctx, await loadPair(ctx, times), args.work_id)
    return null
  },
})
