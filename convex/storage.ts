import { asyncMap } from 'convex-helpers'
import { v } from 'convex/values'

import { internalAction } from './_generated/server'
import { getErrorMessage } from './shared/utils'

export const deleteFiles = internalAction({
  args: {
    storageIds: v.array(v.id('_storage')),
  },
  handler: async (ctx, { storageIds }) => {
    await asyncMap(storageIds, async (storageId) => {
      try {
        await ctx.storage.delete(storageId)
      } catch (err) {
        console.error('[deleteFiles]', getErrorMessage(err))
      }
    })
  },
})
