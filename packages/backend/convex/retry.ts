import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalAction } from './_generated/server'
import * as eventHistory from './events/ingest'
import * as pricingHistory from './history/pricing/ingest'
import { workId } from './ingestion/work'
import { reader } from './scan'

/** Manual recovery of a Pricing obligation; the routine supplies its already-loaded pair directly. */
export const pricing = internalAction({
  args: { work_id: workId },
  returns: v.null(),
  handler: async (ctx, args) => {
    const times = await ctx.runQuery(internal.ingestion.work.getWorkInput, {
      ...args,
      processor: 'pricing',
    })

    if (times === null) {
      return null
    }

    await pricingHistory.process(ctx, await reader(ctx).loadPair(times), args.work_id)
    return null
  },
})

/** Retry an Events obligation using its exact observation pair. */
export const events = internalAction({
  args: { work_id: workId },
  returns: v.null(),
  handler: async (ctx, args) => {
    const times = await ctx.runQuery(internal.ingestion.work.getWorkInput, {
      ...args,
      processor: 'events',
    })

    if (times === null) {
      return null
    }

    await eventHistory.process(ctx, await reader(ctx).loadPair(times), args.work_id)
    return null
  },
})
