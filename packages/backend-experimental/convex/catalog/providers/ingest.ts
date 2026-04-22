import { ConvexError, v } from 'convex/values'

import { defineMutationSpec } from '../../lib/functionSpec'
import { processComponent } from '../components'
import { getState } from './queries'
import { coreContentFields } from './schema'

export const setAvailability = defineMutationSpec({
  args: {
    firstSeenAt: v.number(),
    id: v.string(),
    unavailableAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const state = await getState(ctx, args.id)

    if (!state) {
      throw new ConvexError({ message: 'state not found', id: args.id })
    }

    const wasUnavailable = state.unavailableAt !== undefined
    const isUnavailable = args.unavailableAt !== undefined

    if (wasUnavailable === isUnavailable) {
      return
    }

    // append state row
    await ctx.db.insert('catalog_providers', {
      id: state.id,
      version: state.version + 1,
      firstSeenAt: args.firstSeenAt,
      unavailableAt: args.unavailableAt,
      coreVersion: state.coreVersion,
      coreContentHash: state.coreContentHash,
    })
  },
})

export const ingest = defineMutationSpec({
  args: {
    firstSeenAt: v.number(),
    entity: v.object({
      id: v.string(),
      core: v.object(coreContentFields),
    }),
  },
  handler: async (ctx, args) => {
    const state = await getState(ctx, args.entity.id)

    const core = await processComponent({
      state: state
        ? {
            version: state.coreVersion,
            contentHash: state.coreContentHash,
          }
        : undefined,
      content: args.entity.core,
      firstSeenAt: args.firstSeenAt,
      toStateFields: (componentState) => ({
        coreVersion: componentState.version,
        coreContentHash: componentState.contentHash,
      }),
      appendComponentRow: async (row) => ctx.db.insert('catalog_provider_core', row),
    })

    const nextUnavailableAt = undefined
    const componentStateChanged = core.action === 'append'
    const availabilityChanged = state?.unavailableAt !== nextUnavailableAt

    if (componentStateChanged || availabilityChanged) {
      // append state row
      await ctx.db.insert('catalog_providers', {
        id: args.entity.id,
        version: (state?.version ?? 0) + 1,
        firstSeenAt: args.firstSeenAt,
        unavailableAt: nextUnavailableAt,
        ...core.stateFields,
      })
    }
  },
})
