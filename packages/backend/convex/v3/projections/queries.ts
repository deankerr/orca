import { omit } from 'convex-helpers'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'

import { query } from '../../_generated/server'
import {
  V3_MODELS_VIEW_TABLE,
  V3_PROVIDERS_VIEW_TABLE,
  V3_ENDPOINTS_VIEW_TABLE,
  modelsViewTable,
  providersViewTable,
  endpointsViewTable,
} from '../entities.table'
import {
  V3_ENDPOINTS_LISTING_SERIES_TABLE,
  V3_ENDPOINTS_PRICING_SERIES_TABLE,
  endpointsListingTable,
  endpointsPricingTable,
} from '../series.table'

/** Read models in creation order, without deployment-local system fields. */
export const models = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(modelsViewTable.validator),
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
  returns: paginationResultValidator(providersViewTable.validator),
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
  returns: paginationResultValidator(endpointsViewTable.validator),
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
  returns: paginationResultValidator(endpointsListingTable.validator),
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
  returns: paginationResultValidator(endpointsPricingTable.validator),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query(V3_ENDPOINTS_PRICING_SERIES_TABLE)
      .order('asc')
      .paginate(args.paginationOpts)
    return { ...result, page: result.page.map((row) => omit(row, ['_id', '_creationTime'])) }
  },
})
