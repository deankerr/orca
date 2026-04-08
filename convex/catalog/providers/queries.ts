import { v } from 'convex/values'

import { defineQuerySpec } from '../../lib/functionSpec'
import { createProviderProjection } from './projection'

const TABLE_NAME = 'or_views_providers'

export const list = defineQuerySpec({
  args: v.object({}),
  async handler(ctx, _args) {
    const docs = await ctx.db.query(TABLE_NAME).withIndex('by_name').order('asc').collect()
    return docs.map(createProviderProjection)
  },
})

export const get = defineQuerySpec({
  args: v.object({
    slug: v.string(),
  }),
  async handler(ctx, args) {
    const doc = await ctx.db
      .query(TABLE_NAME)
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    return doc ? createProviderProjection(doc) : null
  },
})
