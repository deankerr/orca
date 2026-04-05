import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import type { MutationCtx, QueryCtx } from '../../_generated/server'
import { createTableVHelper } from '../../lib/vTable'

export const table = defineTable({
  entity_type: v.union(v.literal('model'), v.literal('endpoint'), v.literal('provider')),
  entity_key: v.string(), // slug for models/providers, uuid for endpoints
  data: v.record(v.string(), v.any()), // raw API artifact
  updated_at: v.number(),
}).index('by_entity', ['entity_type', 'entity_key'])

export const vTable = createTableVHelper('or_sources', table.validator)

export async function insert(
  ctx: MutationCtx,
  data: Omit<typeof vTable.validator.type, 'updated_at'>,
) {
  return ctx.db.insert(vTable.name, { ...data, updated_at: Date.now() })
}

export async function replace(
  ctx: MutationCtx,
  id: typeof vTable._id.type,
  data: Omit<typeof vTable.validator.type, 'updated_at'>,
) {
  await ctx.db.replace(id, { ...data, updated_at: Date.now() })
}

export async function getModelDescription(ctx: QueryCtx, modelSlug: string) {
  const model = await ctx.db
    .query(vTable.name)
    .withIndex('by_entity', (q) => q.eq('entity_type', 'model').eq('entity_key', modelSlug))
    .unique()
  if (!model) {
    return null
  }
  const description = model.data?.description
  if (typeof description !== 'string' || description === '') {
    return null
  }
  return description
}
