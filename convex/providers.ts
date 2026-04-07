import { v } from 'convex/values'

import { query } from './_generated/server'
import { db } from './db'
import { transformProviders } from './db/or/views/providers'

export const list = query({
  handler: async (ctx) => db.or.views.providers.collect(ctx).then(transformProviders),
})

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => db.or.views.providers.get(ctx, args.slug),
})
