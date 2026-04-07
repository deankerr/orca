import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import { omit } from 'remeda'

import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { createTableVHelper } from '../../../lib/vTable'

export const table = defineTable({
  slug: v.string(),

  name: v.string(),
  icon_url: v.string(), // deprecated

  headquarters: v.optional(v.string()),
  datacenters: v.optional(v.array(v.string())),
  status_page_url: v.optional(v.string()),
  terms_of_service_url: v.optional(v.string()),
  privacy_policy_url: v.optional(v.string()),

  // orca
  unavailable_at: v.optional(v.number()),
  updated_at: v.number(),
})
  .index('by_name', ['name'])
  .index('by_slug', ['slug'])

export const vTable = createTableVHelper('or_views_providers', table.validator)

export async function collect(ctx: QueryCtx) {
  return ctx.db.query(vTable.name).withIndex('by_name').order('asc').collect()
}

export async function insert(
  ctx: MutationCtx,
  data: Omit<typeof vTable.validator.type, 'updated_at'>,
) {
  return ctx.db.insert(vTable.name, { ...data, updated_at: Date.now() })
}

export async function patch(
  ctx: MutationCtx,
  id: typeof vTable._id.type,
  updates: Partial<Omit<typeof vTable.validator.type, 'updated_at'>>,
) {
  await ctx.db.patch(id, { ...updates, updated_at: Date.now() })
}

export async function replace(
  ctx: MutationCtx,
  id: typeof vTable._id.type,
  data: Omit<typeof vTable.validator.type, 'updated_at'>,
) {
  await ctx.db.replace(id, { ...data, updated_at: Date.now() })
}

// -- Provider transform

export function transformProvider(doc: Doc<'or_views_providers'>) {
  return omit(doc, ['icon_url'])
}

export function transformProviders(docs: Doc<'or_views_providers'>[]) {
  return docs.map(transformProvider)
}

export async function get(ctx: QueryCtx, slug: string) {
  const doc = await ctx.db
    .query(vTable.name)
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .first()
  return doc ? transformProvider(doc) : null
}
