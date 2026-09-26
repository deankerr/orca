import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction, internalQuery } from '../_generated/server'
import { clock } from './clock'
import { load } from './scan/load'
import { process } from './stats/ingest'
import { publishedScanAt } from './stats/query'

/** Latest-only policy belongs to composition; the publish mutation also guards concurrent attempts. */
export const getRefreshScanAt = internalQuery({
  args: {},
  returns: v.union(v.null(), v.string()),
  handler: async (ctx) => {
    const scanAt = await clock(ctx)
    if (scanAt === null) {
      return null
    }
    const published = await publishedScanAt(ctx)
    return published !== null && published >= scanAt ? null : scanAt
  },
})

/** Manual recovery: load only the latest unpublished observation; routine processing reuses its pair. */
export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const scanAt: string | null = await ctx.runQuery(internal.v4.refreshStats.getRefreshScanAt, {})
    if (scanAt === null) {
      return null
    }
    const scan = await load(ctx, scanAt)
    await process(ctx, scanAt, scan.endpoints.values())
    return null
  },
})
