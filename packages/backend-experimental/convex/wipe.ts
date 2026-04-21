import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { TableNames } from './_generated/dataModel'
import { internalAction, internalMutation } from './_generated/server'

const tableNames: TableNames[] = [
  'catalog_versions',
  'catalog_endpoints',
  'catalog_endpoint_core',
  'catalog_endpoint_pricing',
  'catalog_models',
  'catalog_model_descriptions',
  'catalog_providers',
]

const tableNameValidator = v.union(
  v.literal('catalog_versions'),
  v.literal('catalog_endpoints'),
  v.literal('catalog_endpoint_core'),
  v.literal('catalog_endpoint_pricing'),
  v.literal('catalog_models'),
  v.literal('catalog_model_descriptions'),
  v.literal('catalog_providers'),
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
