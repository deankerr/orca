import { WithoutSystemFields } from 'convex/server'
import { v } from 'convex/values'
import { diff } from 'json-diff-ts'

import { Doc } from '../../_generated/dataModel'
import { internalMutation } from '../../_generated/server'
import { db } from '../../db'

export const upsert = internalMutation({
  args: {
    previous_crawl_id: v.string(),
    crawl_id: v.string(),
    changes: v.array(db.or.views.changes.table.validator),
  },
  returns: v.object({
    insert: v.number(),
    update: v.number(),
    delete: v.number(),
    stable: v.number(),
  }),
  handler: async (ctx, args) => {
    // * for identifying the same change subject
    function changeKey(change: WithoutSystemFields<Doc<'or_views_changes'>>) {
      return [
        change.entity_type,
        change.change_kind,
        (change as any).model_slug ?? '',
        (change as any).provider_slug ?? '',
        (change as any).provider_tag_slug ?? '',
        (change as any).endpoint_uuid ?? '',
        change.path ?? '',
      ].join('|')
    }

    const existing = await ctx.db
      .query('or_views_changes')
      .withIndex('by_previous_crawl_id__crawl_id', (q) =>
        q.eq('previous_crawl_id', args.previous_crawl_id).eq('crawl_id', args.crawl_id),
      )
      .collect()

    const counters = {
      insert: 0,
      update: 0,
      delete: 0,
      stable: 0,
    }

    const existingByKey = new Map<string, Doc<'or_views_changes'>>()

    for (const doc of existing) {
      const key = changeKey(doc)
      existingByKey.set(key, doc)
    }

    for (const change of args.changes) {
      if (
        change.previous_crawl_id !== args.previous_crawl_id ||
        change.crawl_id !== args.crawl_id
      ) {
        throw new Error('Change pair mismatch in replacePair mutation')
      }

      const key = changeKey(change)
      const current = existingByKey.get(key)

      if (!current) {
        await ctx.db.insert('or_views_changes', change)
        counters.insert++
        continue
      }

      const diffResults = diff(current, change, {
        keysToSkip: ['_id', '_creationTime'],
      })

      if (!diffResults.length) {
        counters.stable++
      } else {
        await ctx.db.replace(current._id, change)
        counters.update++
      }

      existingByKey.delete(key)
    }

    for (const leftover of existingByKey.values()) {
      await ctx.db.delete(leftover._id)
      counters.delete++
    }

    return counters
  },
})
