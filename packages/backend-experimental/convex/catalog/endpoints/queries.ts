import { stream } from 'convex-helpers/server/stream'
import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import type { Doc } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { defineQuerySpec } from '../../lib/functionSpec'
import schema from '../../schema'
import { withCatalogMetadata } from '../components'

type State = Doc<'catalog_endpoints'>

export async function getState(ctx: QueryCtx, id: string) {
  return ctx.db
    .query('catalog_endpoints')
    .withIndex('by_id__version', (q) => q.eq('id', id))
    .order('desc')
    .first()
}

export const listAvailableStatesByModel = defineQuerySpec({
  args: {
    modelVersionSlug: v.string(),
    modelVariant: v.string(),
  },
  handler: async (ctx, args) =>
    stream(ctx.db, schema)
      .query('catalog_endpoints')
      .withIndex('by_modelVersionSlug__modelVariant__id__version', (q) =>
        q.eq('modelVersionSlug', args.modelVersionSlug).eq('modelVariant', args.modelVariant),
      )
      .order('desc')
      .distinct(['id'])
      .filterWith(async (state) => state.unavailableAt === undefined)
      .collect(),
})

// Component getters

async function getCoreByIdAndVersion(ctx: QueryCtx, state: State) {
  const core = await ctx.db
    .query('catalog_endpoint_core')
    .withIndex('by_id__version', (q) => q.eq('id', state.id).eq('version', state.coreVersion))
    .first()

  return core ? withCatalogMetadata(core) : null
}

async function getPricingByIdAndVersion(ctx: QueryCtx, state: State) {
  const pricing = await ctx.db
    .query('catalog_endpoint_pricing')
    .withIndex('by_id__version', (q) => q.eq('id', state.id).eq('version', state.pricingVersion))
    .first()

  return pricing ? withCatalogMetadata(pricing) : null
}

// Hydration

async function hydrate(ctx: QueryCtx, state: State) {
  const [core, pricing] = await Promise.all([
    getCoreByIdAndVersion(ctx, state),
    getPricingByIdAndVersion(ctx, state),
  ])

  if (!core) {
    throw new ConvexError({
      message: 'component not found',
      component: 'core',
      id: state.id,
      version: state.coreVersion,
    })
  }

  if (!pricing) {
    throw new ConvexError({
      message: 'component not found',
      component: 'pricing',
      id: state.id,
      version: state.pricingVersion,
    })
  }

  return {
    state,
    core,
    pricing,
  }
}

function isWithinAvailabilityWindow(state: State, maxUnavailableMs?: number) {
  if (maxUnavailableMs === undefined) {
    return true
  }

  return state.unavailableAt === undefined || state.unavailableAt >= Date.now() - maxUnavailableMs
}

// Queries

export const get = defineQuerySpec({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const state = await getState(ctx, args.id)

    if (!state) {
      return null
    }

    return hydrate(ctx, state)
  },
})

export const list = defineQuerySpec({
  args: {
    paginationOpts: paginationOptsValidator,
    maxUnavailableMs: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    stream(ctx.db, schema)
      .query('catalog_endpoints')
      .withIndex('by_id__version')
      .order('desc')
      .distinct(['id'])
      .filterWith(async (state) => isWithinAvailabilityWindow(state, args.maxUnavailableMs))
      .map(async (state) => hydrate(ctx, state))
      .paginate(args.paginationOpts),
})

export const history = defineQuerySpec({
  args: {
    id: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    stream(ctx.db, schema)
      .query('catalog_endpoints')
      .withIndex('by_id__version', (q) => q.eq('id', args.id))
      .order('desc')
      .map(async (state) => hydrate(ctx, state))
      .paginate(args.paginationOpts),
})
