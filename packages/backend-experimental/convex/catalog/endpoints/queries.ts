import { stream } from 'convex-helpers/server/stream'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { defineQuerySpec } from '../../lib/functionSpec'
import schema from '../../schema'

type EndpointVersion = Doc<'catalog_endpoints_base'>
type EndpointPricingVersion = Doc<'catalog_endpoint_pricing'>

async function getEndpointBase(ctx: QueryCtx, uuid: string) {
  return ctx.db
    .query('catalog_endpoints_base')
    .withIndex('by_uuid_and_since_at', (q) => q.eq('uuid', uuid))
    .order('desc')
    .first()
}

async function getPricing(ctx: QueryCtx, uuid: string) {
  return ctx.db
    .query('catalog_endpoint_pricing')
    .withIndex('by_uuid_and_since_at', (q) => q.eq('uuid', uuid))
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
  const pricing = await getPricing(ctx, endpointBase.uuid)

  if (!pricing) {
    throw new Error(`Missing endpoint pricing row for endpoint uuid "${endpointBase.uuid}"`)
  }

  return withPricing(endpointBase, pricing)
}

export const get = defineQuerySpec({
  args: {
    uuid: v.string(),
  },
  handler: async (ctx, args) => {
    const endpointBase = await getEndpointBase(ctx, args.uuid)

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
      .query('catalog_endpoints_base')
      .withIndex('by_uuid_and_since_at')
      .order('desc')
      .distinct(['uuid'])
      .map(async (endpointBase) => withCurrentPricing(ctx, endpointBase))
      .paginate(args.paginationOpts),
})
