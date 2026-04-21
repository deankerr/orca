import { stream } from 'convex-helpers/server/stream'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { defineQuerySpec } from '../../lib/functionSpec'
import schema from '../../schema'

type State = Doc<'catalog_endpoints'>

function withCatalogMetadata<
  T extends {
    _id: unknown
    _creationTime: number
    firstSeenAt: number
    version: number
    contentHash: string
  },
>(component: T) {
  const { _id, _creationTime, firstSeenAt, version, contentHash, ...content } = component

  return {
    ...content,
    _catalog: {
      _id,
      _creationTime,
      firstSeenAt,
      version,
      contentHash,
    },
  }
}

export async function getState(ctx: QueryCtx, id: string) {
  return ctx.db
    .query('catalog_endpoints')
    .withIndex('by_id__version', (q) => q.eq('id', id))
    .order('desc')
    .first()
}

export const listStatesByModel = defineQuerySpec({
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
    throw new Error(
      `Missing endpoint core version ${state.coreVersion} for endpoint id "${state.id}"`,
    )
  }

  if (!pricing) {
    throw new Error(
      `Missing endpoint pricing version ${state.pricingVersion} for endpoint id "${state.id}"`,
    )
  }

  return {
    state,
    core,
    pricing,
  }
}

function isWithinAvailabilityWindow(state: State, maxUnavailable?: number) {
  if (maxUnavailable === undefined) {
    return true
  }

  return state.unavailableAt === undefined || state.unavailableAt >= Date.now() - maxUnavailable
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
    maxUnavailable: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    stream(ctx.db, schema)
      .query('catalog_endpoints')
      .withIndex('by_id__version')
      .order('desc')
      .distinct(['id'])
      .filterWith(async (state) => isWithinAvailabilityWindow(state, args.maxUnavailable))
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
