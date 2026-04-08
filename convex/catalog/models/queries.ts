import { v } from 'convex/values'

import { defineQuerySpec } from '../../lib/functionSpec'
import { createModelProjection } from './projection'

const TABLE_NAME = 'or_views_models'

export const list = defineQuerySpec({
  args: v.object({}),
  async handler(ctx, _args) {
    const docs = await ctx.db.query(TABLE_NAME).withIndex('by_or_added_at').order('desc').collect()
    return docs.map((doc) => createModelProjection(doc))
  },
})

export const getDescription = defineQuerySpec({
  args: v.object({
    slug: v.string(),
  }),
  async handler(ctx, args) {
    const doc = await ctx.db
      .query('or_views_model_descriptions')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .first()

    return doc?.description
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

    if (!doc) {
      return null
    }

    const description = await getDescription.handler(ctx, { slug: args.slug })
    return createModelProjection(doc, { description: description })
  },
})
