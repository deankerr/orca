import { zodOutputToConvex } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'

import { query } from '#generated/server'

import { CURRENT_ENDPOINTS_TABLE } from '../../catalogNew/tables/current'
import { clock } from '../shared/clock'
import { Endpoint } from '../shared/endpoint'

const UNLISTED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Listed endpoints plus those unlisted within 30 days of the observation clock.
 * Older last-known rows stay stored and are absent from this window.
 */
export const grid = query({
  args: {},
  returns: v.array(zodOutputToConvex(Endpoint)),
  handler: async (ctx) => {
    const listed = await ctx.db
      .query(CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_unlisted_at', (q) => q.eq('unlisted_at', undefined))
      .collect()

    const scanAt = await clock(ctx)
    // Before the clock starts, listed baseline rows need no time window.
    if (scanAt === null) {
      return listed.map((row) => Endpoint.parse(row))
    }
    const cutoff = new Date(Date.parse(scanAt) - UNLISTED_WINDOW_MS).toISOString()
    const unlisted = await ctx.db
      .query(CURRENT_ENDPOINTS_TABLE)
      .withIndex('by_unlisted_at', (q) => q.gte('unlisted_at', cutoff))
      .collect()

    return [...listed, ...unlisted].map((row) => Endpoint.parse(row))
  },
})
