import { ConvexError, v } from 'convex/values'

import { defineMutationSpec } from '../../lib/functionSpec'
import { processComponent } from '../components'
import { getState } from './queries'
import { coreContentFields, descriptionContentFields } from './schema'

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
    await ctx.db.insert('catalog_models', {
      id: state.id,
      version: state.version + 1,
      firstSeenAt: args.firstSeenAt,
      unavailableAt: args.unavailableAt,
      coreVersion: state.coreVersion,
      coreContentHash: state.coreContentHash,
      descriptionVersion: state.descriptionVersion,
      descriptionContentHash: state.descriptionContentHash,
    })
  },
})

export const ingest = defineMutationSpec({
  args: {
    firstSeenAt: v.number(),
    entity: v.object({
      id: v.string(),
      core: v.object(coreContentFields),
      description: v.object(descriptionContentFields),
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
      appendComponentRow: async (row) => ctx.db.insert('catalog_model_core', row),
    })

    const description = await processComponent({
      state: state
        ? {
            version: state.descriptionVersion,
            contentHash: state.descriptionContentHash,
          }
        : undefined,
      content: args.entity.description,
      firstSeenAt: args.firstSeenAt,
      toStateFields: (componentState) => ({
        descriptionVersion: componentState.version,
        descriptionContentHash: componentState.contentHash,
      }),
      appendComponentRow: async (row) => ctx.db.insert('catalog_model_descriptions', row),
    })

    const nextUnavailableAt = undefined
    const componentStateChanged = core.action === 'append' || description.action === 'append'
    const availabilityChanged = state?.unavailableAt !== nextUnavailableAt

    if (componentStateChanged || availabilityChanged) {
      // append state row
      await ctx.db.insert('catalog_models', {
        id: args.entity.id,
        version: (state?.version ?? 0) + 1,
        firstSeenAt: args.firstSeenAt,
        unavailableAt: nextUnavailableAt,
        ...core.stateFields,
        ...description.stateFields,
      })
    }
  },
})
