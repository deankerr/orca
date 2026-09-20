import {
  defineSchema,
  defineTable,
  internalMutationGeneric,
  internalQueryGeneric,
} from 'convex/server'
import type { DataModelFromSchemaDefinition, MutationBuilder, QueryBuilder } from 'convex/server'
import { v } from 'convex/values'

import { defineObjectCatalog } from '../index'
import { exposeOperations } from '../lib/function-spec'
import { defineTableModule } from '../lib/table'

// A second, non-storage module exercises normal database writes beyond insert/delete.
const counters = defineTableModule(
  'test_counters',
  defineTable({ key: v.string(), value: v.number() }).index('by_key', ['key']),
)
export const counter = exposeOperations({
  increment: counters.writeOperation({
    args: { key: v.string() },
    handler: async (ctx, { key }) => {
      const row = await ctx.db
        .query('test_counters')
        .withIndex('by_key', (q) => q.eq('key', key))
        .unique()
      const value = (row?.value ?? 0) + 1
      await (row === null
        ? ctx.db.insert('test_counters', { key, value })
        : ctx.db.patch(row._id, { value }))
      return value
    },
    returns: v.number(),
  }),
})

export const catalog = defineObjectCatalog({ table: 'renamed_files' })
export const otherCatalog = defineObjectCatalog({ table: 'other_files' })
export const schema = defineSchema({
  ...catalog.tables,
  ...otherCatalog.tables,
  ...counters.tables,
  unrelated: defineTable({ value: v.string() }),
})
export type DataModel = DataModelFromSchemaDefinition<typeof schema>
// These are the same typed builders a consumer's generated/server supplies.
const query: QueryBuilder<DataModel, 'internal'> = internalQueryGeneric
const mutation: MutationBuilder<DataModel, 'internal'> = internalMutationGeneric
export const incrementCounter = mutation(counter.definitions.increment)

export const find = query({
  ...catalog.definitions.lookup,
  handler: async (ctx, args) => await catalog.lookup(ctx, args),
})
export const commit = mutation(catalog.definitions.insert)
export const erase = mutation(catalog.definitions.remove)
export const otherFind = query(otherCatalog.definitions.lookup)
export const otherCommit = mutation(otherCatalog.definitions.insert)
export const otherErase = mutation(otherCatalog.definitions.remove)

export const rollback = mutation({
  args: catalog.definitions.remove.args,
  handler: async (ctx, args) => {
    await catalog.remove(ctx, args)
    await ctx.db.insert('unrelated', { value: 'must roll back too' })
    throw new Error('abort caller')
  },
  returns: v.null(),
})
