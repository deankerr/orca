import { ConvexError, v } from 'convex/values'

import { defineMutationSpec } from '../../lib/functionSpec'
import { processComponent } from '../components'
import { getState } from './queries'
import { coreContentFields, pricingContentFields } from './schema'

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
    await ctx.db.insert('catalog_endpoints', {
      id: state.id,
      version: state.version + 1,
      firstSeenAt: args.firstSeenAt,
      unavailableAt: args.unavailableAt,
      modelId: state.modelId,
      coreVersion: state.coreVersion,
      coreContentHash: state.coreContentHash,
      pricingVersion: state.pricingVersion,
      pricingContentHash: state.pricingContentHash,
    })
  },
})

export const ingest = defineMutationSpec({
  args: {
    firstSeenAt: v.number(),
    entity: v.object({
      id: v.string(),
      modelId: v.string(),
      core: v.object(coreContentFields),
      pricing: v.object(pricingContentFields),
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
      appendComponentRow: async (row) => ctx.db.insert('catalog_endpoint_core', row),
    })

    const pricing = await processComponent({
      state: state
        ? {
            version: state.pricingVersion,
            contentHash: state.pricingContentHash,
          }
        : undefined,
      content: args.entity.pricing,
      firstSeenAt: args.firstSeenAt,
      toStateFields: (componentState) => ({
        pricingVersion: componentState.version,
        pricingContentHash: componentState.contentHash,
      }),
      appendComponentRow: async (row) => ctx.db.insert('catalog_endpoint_pricing', row),
    })

    const nextUnavailableAt = undefined
    const componentStateChanged = core.action === 'append' || pricing.action === 'append'
    const availabilityChanged = state?.unavailableAt !== nextUnavailableAt

    if (componentStateChanged || availabilityChanged) {
      // append state row
      await ctx.db.insert('catalog_endpoints', {
        id: args.entity.id,
        version: (state?.version ?? 0) + 1,
        firstSeenAt: args.firstSeenAt,
        unavailableAt: nextUnavailableAt,
        modelId: args.entity.modelId,
        ...core.stateFields,
        ...pricing.stateFields,
      })
    }
  },
})
