import type { Infer } from 'convex/values'
import { v } from 'convex/values'

import type { QueryCtx } from '../../_generated/server'
import { createModelProjection } from './projection'

const TABLE_NAME = 'or_views_models'

export const listArgs = v.object({})

export async function list(ctx: QueryCtx, _args: Infer<typeof listArgs>) {
  const docs = await ctx.db.query(TABLE_NAME).withIndex('by_or_added_at').order('desc').collect()
  return docs.map((doc) => createModelProjection(doc))
}

export const getBySlugArgs = v.object({
  slug: v.string(),
})

export async function getBySlug(ctx: QueryCtx, args: Infer<typeof getBySlugArgs>) {
  const doc = await ctx.db
    .query(TABLE_NAME)
    .withIndex('by_slug', (q) => q.eq('slug', args.slug))
    .first()

  if (!doc) {
    return null
  }

  const description = await getDescriptionBySlug(ctx, { slug: args.slug })
  return createModelProjection(doc, { description: description })
}

export const getDescriptionBySlugArgs = v.object({
  slug: v.string(),
})

export async function getDescriptionBySlug(
  ctx: QueryCtx,
  args: Infer<typeof getDescriptionBySlugArgs>,
) {
  const doc = await ctx.db
    .query('or_views_model_descriptions')
    .withIndex('by_slug', (q) => q.eq('slug', args.slug))
    .first()

  return doc?.description
}
