import { v } from 'convex/values'

import { defineQuerySpec } from '../../lib/functionSpec'
import { filterByAvailabilityWindow, getCurrentCatalogTimestamp } from '../shared/availability'
import { createEndpointProjection, createEndpointProjections } from './projection'

const TABLE_NAME = 'or_views_endpoints'

export const list = defineQuerySpec({
  args: v.object({
    maxTimeUnavailable: v.optional(v.number()),
  }),
  async handler(ctx, args) {
    const docs = await ctx.db.query(TABLE_NAME).collect()
    return filterByAvailabilityWindow(createEndpointProjections(docs), {
      maxTimeUnavailable: args.maxTimeUnavailable,
    })
  },
})

export const listForModel = defineQuerySpec({
  args: v.object({
    modelSlug: v.string(),
    maxTimeUnavailable: v.optional(v.number()),
  }),
  async handler(ctx, args) {
    // Keep scoped unavailable filtering relative to the full catalog clock.
    const allDocs =
      args.maxTimeUnavailable === undefined ? [] : await ctx.db.query(TABLE_NAME).collect()
    const currentTime =
      args.maxTimeUnavailable === undefined ? undefined : getCurrentCatalogTimestamp(allDocs)

    // Read the model-scoped view through the existing catalog index.
    const docs = await ctx.db
      .query(TABLE_NAME)
      .withIndex('by_model_slug', (q) => q.eq('model.slug', args.modelSlug))
      .collect()

    return filterByAvailabilityWindow(createEndpointProjections(docs), {
      currentTime,
      maxTimeUnavailable: args.maxTimeUnavailable,
    })
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
