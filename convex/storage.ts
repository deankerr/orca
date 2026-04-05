import { asyncMap } from 'convex-helpers'
import { v } from 'convex/values'

import { getErrorMessage } from '@/shared/utils'

import { internalAction } from './_generated/server'

export const deleteFiles = internalAction({
  args: {
    storageIds: v.array(v.id('_storage')),
  },
  handler: async (ctx, { storageIds }) => {
    await asyncMap(storageIds, async (storageId) => {
      try {
        await ctx.storage.delete(storageId)
      } catch (error) {
        console.error('[deleteFiles]', getErrorMessage(error))
      }
    })
  },
})
