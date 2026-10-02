import { docValidator } from 'convex/server'
import { v } from 'convex/values'
import { gzipSync } from 'fflate'

import { internal } from '../../_generated/api'
import { internalAction, internalMutation, internalQuery } from '../../_generated/server'
import { buildSnapshot, latestScanId } from './snapshot'
import { publicApiV2CacheTable } from './table'

export const get = internalQuery({
  args: {},
  returns: v.union(v.null(), docValidator('public_api_v2_cache', publicApiV2CacheTable)),
  handler: async (ctx) => await ctx.db.query('public_api_v2_cache').order('desc').first(),
})

/**
 * Swap identity and pointer atomically. Duplicate/older builds cannot replace newer data.
 * Returns the unused blob (rejected incoming or replaced previous), for deletion after commit.
 */
export const replaceIfNewer = internalMutation({
  args: {
    ...publicApiV2CacheTable.validator.fields,
    scan_id: v.string(),
  },
  returns: v.union(v.null(), v.id('_storage')),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('public_api_v2_cache').order('desc').first()

    if (existing?.scan_id !== undefined && existing.scan_id >= args.scan_id) {
      return args.storage_id
    }

    if (existing !== null) {
      await ctx.db.delete('public_api_v2_cache', existing._id)
    }

    await ctx.db.insert('public_api_v2_cache', args)

    // The caller deletes only the unused blob, after this transaction commits.
    return existing?.storage_id ?? null
  },
})

/** Independent cron: an absent scan_id intentionally refreshes legacy cache rows once. */
export const refresh = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const cached = await ctx.runQuery(internal.public_api.v2.cache.get)
    const scanId = await latestScanId(ctx, cached?.scan_id)

    if (scanId === null || scanId === cached?.scan_id) {
      return null
    }

    const result = await buildSnapshot(ctx, scanId)
    const encoded = new TextEncoder().encode(JSON.stringify(result))
    const compressed = gzipSync(encoded)
    const storage_id = await ctx.storage.store(new Blob([new Uint8Array(compressed)]))
    const unusedStorageId = await ctx.runMutation(internal.public_api.v2.cache.replaceIfNewer, {
      scan_id: scanId,
      content_type: 'application/json',
      storage_id,
      size: compressed.byteLength,
    })

    if (unusedStorageId !== null) {
      try {
        await ctx.storage.delete(unusedStorageId)
      } catch (error) {
        console.error('[public_api:v2:refresh] failed to delete unused blob', {
          storage_id: unusedStorageId,
          error: String(error),
        })
      }
    }

    console.log('[public_api:v2:refresh]', {
      scan_id: scanId,
      size: compressed.byteLength,
      raw: encoded.byteLength,
    })
    return null
  },
})
