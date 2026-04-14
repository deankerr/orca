import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { TableNames } from './_generated/dataModel'
import { internalAction, internalMutation } from './_generated/server'

const tableNames: TableNames[] = [
  'catalog_registry',
  'catalog_endpoints_base',
  'catalog_endpoint_pricing',
  'catalog_models_base',
  'catalog_providers_base',
]

const tableNameValidator = v.union(
  v.literal('catalog_registry'),
  v.literal('catalog_endpoints_base'),
  v.literal('catalog_endpoint_pricing'),
  v.literal('catalog_models_base'),
  v.literal('catalog_providers_base'),
)

const deleteBatchSize = 128

export const deleteBatch = internalMutation({
  args: {
    tableName: tableNameValidator,
    take: v.number(),
  },
  handler: async (ctx, args) => {
    const docs = await ctx.db.query(args.tableName).take(args.take)

    for (const doc of docs) {
      await ctx.db.delete(doc._id)
    }

    return {
      deleted: docs.length,
      done: docs.length < args.take,
    }
  },
})

export const run = internalAction({
  args: {},
  handler: async (ctx) => {
    const tables: { tableName: TableNames; deleted: number }[] = []

    for (const tableName of tableNames) {
      let deleted = 0

      while (true) {
        const result: { deleted: number; done: boolean } = await ctx.runMutation(
          internal.wipe.deleteBatch,
          {
            tableName,
            take: deleteBatchSize,
          },
        )

        deleted += result.deleted

        if (result.done) {
          break
        }
      }

      tables.push({ tableName, deleted })
    }

    return {
      batchSize: deleteBatchSize,
      tables,
    }
  },
})
