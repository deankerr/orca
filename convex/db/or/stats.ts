import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { TableAggregate } from '@convex-dev/aggregate'

import { components } from '../../_generated/api'
import { DataModel, Doc } from '../../_generated/dataModel'
import { MutationCtx } from '../../_generated/server'
import { createTableVHelper } from '../../lib/vTable'

// Daily stats for each model

// -> view stats for each day
// -> view stats for a model across time

// -> charts/visualisations

export const table = defineTable({
  // timestamp + slug = unique key
  day_timestamp: v.number(), // 0:00 UTC, daily
  slug: v.string(),

  base_slug: v.string(),
  version_slug: v.string(),
  variant: v.string(),

  count: v.number(),
  total_output_tokens: v.number(),
  total_input_tokens: v.number(),
  total_native_tokens_reasoning: v.number(),
  num_media_input: v.number(),
  num_media_output: v.number(),
  total_native_tokens_cached: v.number(),
  total_tool_calls: v.number(),

  or_date: v.string(),
  crawl_id: v.string(),
})
  .index('by_day_timestamp', ['day_timestamp'])
  .index('by_slug__day_timestamp', ['slug', 'day_timestamp'])

export const vTable = createTableVHelper('or_stats', table.validator)

const statsByTimeAggregate = new TableAggregate<{
  Key: number
  DataModel: DataModel
  TableName: 'or_stats'
}>(components.aggregateModelStatsByTime, {
  sortKey: (doc) => doc.day_timestamp,
})

export async function insertDoc(
  ctx: MutationCtx,
  { fields }: { fields: typeof vTable.validator.type },
) {
  const id = await ctx.db.insert('or_stats', fields)
  const doc = await ctx.db.get(id)
  await statsByTimeAggregate.insert(ctx, doc!)
}

export async function replaceDoc(
  ctx: MutationCtx,
  { oldDoc, fields }: { oldDoc: Doc<'or_stats'>; fields: typeof vTable.validator.type },
) {
  await ctx.db.replace(oldDoc._id, fields)
  const newDoc = await ctx.db.get(oldDoc._id)
  await statsByTimeAggregate.replace(ctx, oldDoc, newDoc!)
}
