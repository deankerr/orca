import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { TableNames } from './_generated/dataModel'
import { internalAction, internalMutation } from './_generated/server'

const tableNames: TableNames[] = [
  'catalog_endpoints_snapshots',
  'catalog_endpoints_state',
  'catalog_endpoints_views',
  'catalog_models_snapshots',
  'catalog_models_state',
  'catalog_models_views',
  'catalog_providers_snapshots',
  'catalog_providers_state',
  'catalog_providers_views',
  'endpoint_stats_samples',
]

const tableNameValidator = v.union(
  v.literal('catalog_endpoints_snapshots'),
  v.literal('catalog_endpoints_state'),
  v.literal('catalog_endpoints_views'),
  v.literal('catalog_models_snapshots'),
  v.literal('catalog_models_state'),
  v.literal('catalog_models_views'),
  v.literal('catalog_providers_snapshots'),
  v.literal('catalog_providers_state'),
  v.literal('catalog_providers_views'),
  v.literal('endpoint_stats_samples'),
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

      tables.push({ deleted, tableName })
    }

    return {
      batchSize: deleteBatchSize,
      tables,
    }
  },
})
