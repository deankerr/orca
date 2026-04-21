import { v } from 'convex/values'

import { defineMutationSpec } from '../../lib/functionSpec'
import { createContentHash } from '../hash'
import { getState } from './queries'
import { coreContentFields, pricingContentFields } from './table'

type ComponentState = {
  version: number
  contentHash: string
}

type ProcessedComponent<TStateFields> = {
  action: 'stable' | 'append'
  stateFields: TStateFields
}

async function processComponent<TContent extends Record<string, unknown>, TStateFields>(args: {
  state?: ComponentState
  content: TContent
  firstSeenAt: number
  toStateFields: (state: ComponentState) => TStateFields
  appendComponentRow: (
    row: TContent & {
      firstSeenAt: number
      version: number
      contentHash: string
    },
  ) => Promise<unknown>
}): Promise<ProcessedComponent<TStateFields>> {
  const contentHash = await createContentHash(args.content)

  if (args.state?.contentHash === contentHash) {
    return {
      action: 'stable',
      stateFields: args.toStateFields(args.state),
    }
  }

  const state = {
    version: (args.state?.version ?? 0) + 1,
    contentHash,
  }

  await args.appendComponentRow({
    ...args.content,
    firstSeenAt: args.firstSeenAt,
    version: state.version,
    contentHash: state.contentHash,
  })

  return {
    action: 'append',
    stateFields: args.toStateFields(state),
  }
}

export const setAvailability = defineMutationSpec({
  args: {
    firstSeenAt: v.number(),
    id: v.string(),
    unavailableAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const state = await getState(ctx, args.id)

    if (!state) {
      throw new Error(`Missing endpoint state for availability update: "${args.id}"`)
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
      modelVersionSlug: state.modelVersionSlug,
      modelVariant: state.modelVariant,
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
      modelVersionSlug: v.string(),
      modelVariant: v.string(),
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
        modelVersionSlug: args.entity.modelVersionSlug,
        modelVariant: args.entity.modelVariant,
        ...core.stateFields,
        ...pricing.stateFields,
      })
    }
  },
})
