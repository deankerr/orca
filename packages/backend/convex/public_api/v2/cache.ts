import { docValidator } from 'convex/server'
import { v } from 'convex/values'
import { gzipSync } from 'fflate'

import { internal } from '#generated/api'
import { internalAction, internalMutation, internalQuery } from '#generated/server'
import * as scans from '#scans'

import { buildSnapshot } from './snapshot'
import { PUBLIC_API_V2_CACHE_TABLE, publicApiV2CacheTable } from './table'

export const get = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query(PUBLIC_API_V2_CACHE_TABLE).order('desc').first(),
  returns: v.union(v.null(), docValidator(PUBLIC_API_V2_CACHE_TABLE, publicApiV2CacheTable)),
})

/**
 * Swap identity and pointer atomically. Duplicate/older builds cannot replace newer data.
 * Returns the unused blob (rejected incoming or replaced previous), for deletion after commit.
 */
export const replaceIfNewer = internalMutation({
  args: {
    ...publicApiV2CacheTable.validator.omit('scan_id').fields,
    scan_at: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query(PUBLIC_API_V2_CACHE_TABLE).order('desc').first()
    const existingScanAt = existing?.scan_at

    if (existingScanAt !== undefined && existingScanAt >= args.scan_at) {
      return args.storage_id
    }

    if (existing !== null) {
      await ctx.db.delete(PUBLIC_API_V2_CACHE_TABLE, existing._id)
    }

    await ctx.db.insert(PUBLIC_API_V2_CACHE_TABLE, args)

    // The caller deletes only the unused blob, after this transaction commits.
    return existing?.storage_id ?? null
  },
  returns: v.union(v.null(), v.id('_storage')),
})

/** A legacy cache without a capture time triggers a fresh build. */
export const refresh = internalAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    const cached = await ctx.runQuery(internal.public_api.v2.cache.get)
    const cachedScanAt = cached?.scan_at ?? null
    const scanAt = (await scans.latest(ctx, { atOrAfter: cachedScanAt })) ?? cachedScanAt

    if (scanAt === null || scanAt === cachedScanAt) {
      return null
    }

    const result = await buildSnapshot(ctx, scanAt)
    const encoded = new TextEncoder().encode(JSON.stringify(result))
    const compressed = gzipSync(encoded)
    const storage_id = await ctx.storage.store(new Blob([new Uint8Array(compressed)]))

    const unusedStorageId = await ctx.runMutation(internal.public_api.v2.cache.replaceIfNewer, {
      content_type: 'application/json',
      scan_at: scanAt,
      size: compressed.byteLength,
      storage_id,
    })

    if (unusedStorageId !== null) {
      try {
        await ctx.storage.delete(unusedStorageId)
      } catch (error) {
        console.error('[public_api:v2:refresh] failed to delete unused blob', {
          error: String(error),
          storage_id: unusedStorageId,
        })
      }
    }

    console.log('[public_api:v2:refresh]', {
      raw: encoded.byteLength,
      scan_at: scanAt,
      size: compressed.byteLength,
    })

    return null
  },
  returns: v.null(),
})
