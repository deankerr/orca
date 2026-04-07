import { v } from 'convex/values'

import { query } from './_generated/server'
import { db } from './db'
import { transformModels } from './db/or/views/models'

export const list = query({
  handler: async (ctx) => db.or.views.models.collect(ctx).then(transformModels),
})

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => db.or.views.models.get(ctx, args.slug),
})
