import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { type MutationCtx, type QueryCtx } from '../../../_generated/server'
import { createTableVHelper } from '../../../lib/vTable'
import { getModelDescription } from '../sources'

export const table = defineTable({
  slug: v.string(),
  base_slug: v.string(),
  version_slug: v.string(),
  variant: v.string(),

  name: v.string(),
  icon_url: v.string(), // deprecated

  author_slug: v.string(),
  author_name: v.string(),

  or_added_at: v.number(),

  input_modalities: v.array(v.string()),
  output_modalities: v.array(v.string()),

  reasoning: v.boolean(),

  // details, informational only
  hugging_face_id: v.optional(v.string()),
  tokenizer: v.optional(v.string()),
  instruct_type: v.optional(v.string()),
  promotion_message: v.optional(v.string()),
  warning_message: v.optional(v.string()),

  // orca
  unavailable_at: v.optional(v.number()),
  updated_at: v.number(),
})
  .index('by_or_added_at', ['or_added_at'])
  .index('by_slug', ['slug'])

export const vTable = createTableVHelper('or_views_models', table.validator)

export async function collect(ctx: QueryCtx) {
  return await ctx.db.query(vTable.name).withIndex('by_or_added_at').order('desc').collect()
}

export async function insert(
  ctx: MutationCtx,
  data: Omit<typeof vTable.validator.type, 'updated_at'>,
) {
  return await ctx.db.insert(vTable.name, { ...data, updated_at: Date.now() })
}

export async function patch(
  ctx: MutationCtx,
  id: typeof vTable._id.type,
  updates: Partial<Omit<typeof vTable.validator.type, 'updated_at'>>,
) {
  return await ctx.db.patch(id, { ...updates, updated_at: Date.now() })
}

export async function replace(
  ctx: MutationCtx,
  id: typeof vTable._id.type,
  data: Omit<typeof vTable.validator.type, 'updated_at'>,
) {
  return await ctx.db.replace(id, { ...data, updated_at: Date.now() })
}

export async function getWithDescription(ctx: QueryCtx, slug: string) {
  const model = await ctx.db
    .query(vTable.name)
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .order('desc')
    .first()
  if (!model) {
    return null
  }

  const description = (await getModelDescription(ctx, slug)) ?? ''
  return {
    ...model,
    description,
  }
}
