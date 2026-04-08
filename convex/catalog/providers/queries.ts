import type { Infer } from 'convex/values'
import { v } from 'convex/values'

import type { QueryCtx } from '../../_generated/server'
import { createProviderProjection } from './projection'

const TABLE_NAME = 'or_views_providers'

export const listArgs = v.object({})

export async function list(ctx: QueryCtx, _args: Infer<typeof listArgs>) {
  const docs = await ctx.db.query(TABLE_NAME).withIndex('by_name').order('asc').collect()
  return docs.map(createProviderProjection)
}

export const getBySlugArgs = v.object({
  slug: v.string(),
})

export async function getBySlug(ctx: QueryCtx, args: Infer<typeof getBySlugArgs>) {
  const doc = await ctx.db
    .query(TABLE_NAME)
    .withIndex('by_slug', (q) => q.eq('slug', args.slug))
    .first()

  return doc ? createProviderProjection(doc) : null
}
