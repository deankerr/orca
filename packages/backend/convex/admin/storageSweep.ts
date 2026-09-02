import { v } from 'convex/values'

import { internal } from '../_generated/api'
import type { Id } from '../_generated/dataModel'
import { internalAction, internalMutation, internalQuery } from '../_generated/server'
import { LOCATORS_TABLE } from '../objects/table'

// default grace period: a blob younger than this is never swept, so an
// in-flight store-then-record sequence cannot race the sweep
const DEFAULT_GRACE_MS = 24 * 60 * 60 * 1000

// every table that holds a storage_id pointer must be listed here
const POINTER_TABLES = [LOCATORS_TABLE, 'public_api_v2_cache', 'snapshot_crawl_archives'] as const

type StorageDoc = {
  _id: Id<'_storage'>
  _creationTime: number
}

export const findOrphanedBlobs = internalQuery({
  args: { grace_ms: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const grace_ms = args.grace_ms ?? DEFAULT_GRACE_MS
    const cutoff = Date.now() - grace_ms

    // union of every referenced storage id across all pointer tables
    const referenced = new Set<Id<'_storage'>>()
    for (const table of POINTER_TABLES) {
      for await (const doc of ctx.db.query(table)) {
        if ('storage_id' in doc) {
          referenced.add(doc.storage_id)
        }
      }
    }

    // full scan of the _storage system table - fine at dev scale; needs
    // pagination before this runs against production history
    const orphans: Array<Id<'_storage'>> = []
    for await (const doc of ctx.db.system.query('_storage')) {
      const storage = doc as StorageDoc

      if (!referenced.has(storage._id) && storage._creationTime < cutoff) {
        orphans.push(storage._id)
      }
    }

    return orphans
  },
})

export const deleteBlobs = internalMutation({
  args: { storage_ids: v.array(v.id('_storage')) },
  handler: async (ctx, args) => {
    for (const storage_id of args.storage_ids) {
      await ctx.storage.delete(storage_id)
    }

    return args.storage_ids.length
  },
})

export const sweep = internalAction({
  args: { grace_ms: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // explicit types break the circularity of referencing internal fns from their own module
    const orphans: Id<'_storage'>[] = await ctx.runQuery(
      internal.admin.storageSweep.findOrphanedBlobs,
      { grace_ms: args.grace_ms },
    )

    if (orphans.length === 0) {
      console.log('[storageSweep] no orphaned blobs')
      return { deleted: 0 }
    }

    // one batch per call; each delete is independent so no transaction ordering concerns
    const deleted: number = await ctx.runMutation(internal.admin.storageSweep.deleteBlobs, {
      storage_ids: orphans,
    })

    console.log('[storageSweep] deleted orphaned blobs', { deleted })
    return { deleted }
  },
})
