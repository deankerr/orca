import { v } from 'convex/values'

import { defineQuerySpec } from '../../lib/functionSpec'
import { filterByAvailabilityWindow } from '../shared/availability'
import { createEndpointProjection, createEndpointProjections } from './projection'

const TABLE_NAME = 'or_views_endpoints'

export const list = defineQuerySpec({
  args: v.object({
    maxTimeUnavailable: v.optional(v.number()),
  }),
  async handler(ctx, args) {
    const docs = await ctx.db.query(TABLE_NAME).collect()
    return filterByAvailabilityWindow(createEndpointProjections(docs), args.maxTimeUnavailable)
  },
})

export const get = defineQuerySpec({
  args: v.object({
    uuid: v.string(),
  }),
  async handler(ctx, args) {
    const doc = await ctx.db
      .query(TABLE_NAME)
      .withIndex('by_uuid', (q) => q.eq('uuid', args.uuid))
      .first()

    return doc ? createEndpointProjection(doc) : null
  },
})
