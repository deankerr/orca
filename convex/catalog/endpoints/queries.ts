import type { Infer } from 'convex/values'
import { v } from 'convex/values'

import type { QueryCtx } from '../../_generated/server'
import { filterByAvailabilityWindow } from '../shared/availability'
import { createEndpointProjection, createEndpointProjections } from './projection'

const TABLE_NAME = 'or_views_endpoints'

export const listArgs = v.object({
  maxTimeUnavailable: v.optional(v.number()),
})

export async function list(ctx: QueryCtx, args: Infer<typeof listArgs>) {
  const docs = await ctx.db.query(TABLE_NAME).collect()
  return filterByAvailabilityWindow(createEndpointProjections(docs), args.maxTimeUnavailable)
}

export const getByUuidArgs = v.object({
  uuid: v.string(),
})

export async function getByUuid(ctx: QueryCtx, args: Infer<typeof getByUuidArgs>) {
  const doc = await ctx.db
    .query(TABLE_NAME)
    .withIndex('by_uuid', (q) => q.eq('uuid', args.uuid))
    .first()

  return doc ? createEndpointProjection(doc) : null
}
