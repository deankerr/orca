import { v } from 'convex/values'

import { internal } from '../_generated/api'
import { internalAction, internalMutation } from '../_generated/server'
import { createR2Transport } from './r2'
import { OBJECTS_LOCATORS_TABLE, locatorsTable } from './table'

/** Manually delete one named object. Stop writers for this identity before removing it. */
export const run = internalAction({
  args: { path: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const locator = await ctx.runQuery(internal.objects.locators.get, args)

    if (locator === null) {
      return null
    }

    if (locator.backend === 'r2') {
      await createR2Transport().remove(locator.r2_key)
    }

    await ctx.runMutation(internal.objects.remove.finish, { locator })
    return null
  },
})

/** Delete Convex bytes atomically with the locator; R2 bytes must already be deleted. */
export const finish = internalMutation({
  args: { locator: locatorsTable.validator },
  returns: v.null(),
  handler: async (ctx, { locator }) => {
    const row = await ctx.db
      .query(OBJECTS_LOCATORS_TABLE)
      .withIndex('by_path_name', (q) => q.eq('path', locator.path).eq('name', locator.name))
      .unique()

    if (row === null) {
      return null
    }

    if (
      row.backend !== locator.backend ||
      (row.backend === 'convex' &&
        locator.backend === 'convex' &&
        row.storage_id !== locator.storage_id) ||
      (row.backend === 'r2' && locator.backend === 'r2' && row.r2_key !== locator.r2_key)
    ) {
      throw new Error('Object locator changed during deletion')
    }

    if (row.backend === 'convex' && (await ctx.db.system.get(row.storage_id)) !== null) {
      await ctx.storage.delete(row.storage_id)
    }

    await ctx.db.delete(row._id)
    return null
  },
})
