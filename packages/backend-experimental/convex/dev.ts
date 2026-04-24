import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { TableNames } from './_generated/dataModel'
import { internalAction, internalMutation } from './_generated/server'

const tableNames: TableNames[] = [
  'catalog_endpoints',
  'catalog_endpoints_content',
  'catalog_models',
  'catalog_models_content',
  'catalog_providers',
  'catalog_providers_content',
]

const tableNameValidator = v.union(
  v.literal('catalog_endpoints'),
  v.literal('catalog_endpoints_content'),
  v.literal('catalog_models'),
  v.literal('catalog_models_content'),
  v.literal('catalog_providers'),
  v.literal('catalog_providers_content'),
)

const deleteBatchSize = 4000

export const _deleteBatch = internalMutation({
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

export const wipe = internalAction({
  args: {},
  handler: async (ctx) => {
    const tables: { tableName: TableNames; deleted: number }[] = []

    for (const tableName of tableNames) {
      let deleted = 0

      while (true) {
        const result: { deleted: number; done: boolean } = await ctx.runMutation(
          internal.dev._deleteBatch,
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
