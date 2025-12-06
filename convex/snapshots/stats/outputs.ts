import { asyncMap } from 'convex-helpers'
import { v } from 'convex/values'
import * as R from 'remeda'

import { diff } from 'json-diff-ts'

import { internalMutation } from '../../_generated/server'
import { db } from '../../db'
import { vTable } from '../../db/or/stats'

export const upsert = internalMutation({
  args: {
    stats: v.array(db.or.stats.vTable.validator),
  },
  handler: async (ctx, args) => {
    const results = await asyncMap(args.stats, async (fields) => {
      const oldDoc = await ctx.db
        .query(vTable.name)
        .withIndex('by_slug__day_timestamp', (q) =>
          q.eq('slug', fields.slug).eq('day_timestamp', fields.day_timestamp),
        )
        .first()

      if (!oldDoc) {
        await db.or.stats.insertDoc(ctx, { fields })
        return 'insert'
      } else {
        const diffResults = diff(oldDoc, fields, { keysToSkip: ['_id', '_creationTime'] })
        if (!diffResults.length) return 'stable'

        await db.or.stats.replaceDoc(ctx, { oldDoc, fields })
        return 'replace'
      }
    })

    return R.countBy(results, (r) => r)
  },
})
