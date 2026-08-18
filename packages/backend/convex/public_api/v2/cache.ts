import { v } from 'convex/values'
import { gzipSync } from 'fflate'

import { internal } from '../../_generated/api'
import { internalAction, internalMutation, internalQuery } from '../../_generated/server'
import { getErrorMessage } from '../../shared/utils'

export const get = internalQuery({
  args: {},
  handler: async (ctx) => await ctx.db.query('public_api_v2_cache').order('desc').first(),
})

export const replace = internalMutation({
  args: {
    content_type: v.string(),
    storage_id: v.id('_storage'),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('public_api_v2_cache').order('desc').first()

    if (existing !== null) {
      await ctx.db.delete('public_api_v2_cache', existing._id)
    }

    await ctx.db.insert('public_api_v2_cache', args)

    return { previous: existing }
  },
})

export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    const result = await ctx.runQuery(internal.public_api.v2.queries.get)
    const encoded = new TextEncoder().encode(JSON.stringify(result))
    const compressed = gzipSync(encoded)
    const storage_id = await ctx.storage.store(new Blob([new Uint8Array(compressed)]))

    // Swap the pointer first. Delete the previous blob after commit so a
    // delete failure cannot roll back a good snapshot.
    const { previous } = await ctx.runMutation(internal.public_api.v2.cache.replace, {
      content_type: 'application/json',
      storage_id,
      size: compressed.byteLength,
    })

    if (previous !== null) {
      try {
        await ctx.storage.delete(previous.storage_id)
      } catch (error) {
        console.error('[public_api:v2:refresh] failed to delete previous blob', {
          storage_id: previous.storage_id,
          error: getErrorMessage(error),
        })
      }
    }

    console.log('[public_api:v2:refresh]', {
      size: compressed.byteLength,
      raw: encoded.byteLength,
    })

    return { storage_id, size: compressed.byteLength }
  },
})
