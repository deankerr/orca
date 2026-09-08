import { omit } from 'convex-helpers'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { query } from '../../_generated/server'
import {
  V3_MODELS_VIEW_TABLE,
  V3_PROVIDERS_VIEW_TABLE,
  V3_ENDPOINTS_VIEW_TABLE,
} from '../entities.table'
import { getCurrentScan } from '../ingestions'
import {
  V3_ENDPOINTS_STATS_SERIES_TABLE,
  V3_ENDPOINTS_LISTING_SERIES_TABLE,
  V3_ENDPOINTS_PRICING_SERIES_TABLE,
} from '../series.table'

/** Read models in creation order, without deployment-local system fields. */
export const models = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query(V3_MODELS_VIEW_TABLE)
      .order('asc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map((row) => omit(row, ['_id', '_creationTime'])) }
  },
})

/** Read providers in creation order, without deployment-local system fields. */
export const providers = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query(V3_PROVIDERS_VIEW_TABLE)
      .order('asc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map((row) => omit(row, ['_id', '_creationTime'])) }
  },
})

/** Read endpoints in creation order, without deployment-local system fields. */
export const endpoints = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query(V3_ENDPOINTS_VIEW_TABLE)
      .order('asc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map((row) => omit(row, ['_id', '_creationTime'])) }
  },
})

/** Read endpointListings in creation order, without deployment-local system fields. */
export const endpointListings = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query(V3_ENDPOINTS_LISTING_SERIES_TABLE)
      .order('asc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map((row) => omit(row, ['_id', '_creationTime'])) }
  },
})

/** Read endpointsPricing in creation order, without deployment-local system fields. */
export const endpointsPricing = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query(V3_ENDPOINTS_PRICING_SERIES_TABLE)
      .order('asc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map((row) => omit(row, ['_id', '_creationTime'])) }
  },
})

/** Export the current ingestion record without deployment-local system fields. */
export const currentScan = query({
  args: {},
  handler: async (ctx) => {
    const scan = await getCurrentScan(ctx)
    return scan === null ? null : omit(scan, ['_id', '_creationTime'])
  },
})

/** Export all readings for the scan captured by a pull. */
export const scanStats = query({
  args: { scan_at: v.string() },
  handler: async (ctx, { scan_at }) => {
    const rows = await ctx.db
      .query(V3_ENDPOINTS_STATS_SERIES_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', scan_at))
      .collect()
    return rows.map((row) => omit(row, ['_id', '_creationTime']))
  },
})
