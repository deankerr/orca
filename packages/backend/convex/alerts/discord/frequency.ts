import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internalQuery } from '#generated/server'

import { ENDPOINT_PRICES_TABLE } from '../../history/pricing/table'

/** Discord tolerates occasional repricing, but not sustained quote changes. */
export const PRICE_CHANGE_COUNT = 2
export const PRICE_CHANGE_WINDOW_HOURS = 24

const candidate = v.object({ endpoint_id: v.string(), scan_at: v.string() })
export type PricingCandidate = Infer<typeof candidate>

/** One result per candidate, in input order; prior quotes include filtered small movements. */
export const check = internalQuery({
  args: { candidates: v.array(candidate) },
  returns: v.array(v.boolean()),
  handler: async (ctx, { candidates }) => {
    const results: boolean[] = []

    for (const { endpoint_id, scan_at } of candidates) {
      const start = new Date(
        Date.parse(scan_at) - PRICE_CHANGE_WINDOW_HOURS * 3_600_000,
      ).toISOString()

      const recent = await ctx.db
        .query(ENDPOINT_PRICES_TABLE)
        .withIndex('by_endpoint_id_and_scan_at', (q) =>
          q.eq('endpoint_id', endpoint_id).gte('scan_at', start).lt('scan_at', scan_at),
        )
        .order('desc')
        .take(PRICE_CHANGE_COUNT)

      results.push(recent.length >= PRICE_CHANGE_COUNT)
    }

    return results
  },
})
