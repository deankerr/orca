import { v } from 'convex/values'

import { query } from './_generated/server'
import { db } from './db'

export const list = query({
  handler: async (ctx) => db.or.views.models.collect(ctx),
})

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query('or_views_models')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .order('desc')
      .first(),
})
