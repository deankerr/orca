import { stream } from 'convex-helpers/server/stream'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { defineQuerySpec } from '../../lib/functionSpec'
import schema from '../../schema'

type EndpointVersion = Doc<'catalog_endpoints'>
type EndpointPricingVersion = Doc<'catalog_endpoint_pricing'>

async function getEndpointBase(ctx: QueryCtx, id: string) {
  return ctx.db
    .query('catalog_endpoints')
    .withIndex('by_id__first_seen_at', (q) => q.eq('id', id))
    .order('desc')
    .first()
}

async function getPricing(ctx: QueryCtx, id: string) {
  return ctx.db
    .query('catalog_endpoint_pricing')
    .withIndex('by_id__first_seen_at', (q) => q.eq('id', id))
    .order('desc')
    .first()
}

function withPricing(endpointBase: EndpointVersion, pricing: EndpointPricingVersion) {
  return {
    ...endpointBase,
    pricing,
  }
}

async function withCurrentPricing(
  ctx: QueryCtx,
  endpointBase: EndpointVersion,
): Promise<ReturnType<typeof withPricing>> {
  const pricing = await getPricing(ctx, endpointBase.id)

  if (!pricing) {
    throw new Error(`Missing endpoint pricing row for endpoint id "${endpointBase.id}"`)
  }

  return withPricing(endpointBase, pricing)
}

export const get = defineQuerySpec({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const endpointBase = await getEndpointBase(ctx, args.id)

    if (!endpointBase) {
      return null
    }

    return withCurrentPricing(ctx, endpointBase)
  },
})

export const list = defineQuerySpec({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    stream(ctx.db, schema)
      .query('catalog_endpoints')
      .withIndex('by_id__first_seen_at')
      .order('desc')
      .distinct(['id'])
      .map(async (endpointBase) => withCurrentPricing(ctx, endpointBase))
      .paginate(args.paginationOpts),
})
