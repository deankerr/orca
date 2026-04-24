import { stream } from 'convex-helpers/server/stream'
import { paginationOptsValidator } from 'convex/server'
import { ConvexError, v } from 'convex/values'

import type { Doc } from '../../_generated/dataModel'
import type { QueryCtx } from '../../_generated/server'
import { defineQuerySpec } from '../../lib/functionSpec'
import schema from '../../schema'

type State = Doc<'catalog_providers'>

export async function getState(ctx: QueryCtx, id: string) {
  return ctx.db
    .query('catalog_providers')
    .withIndex('by_entity_id__observedAt', (q) => q.eq('entity.id', id))
    .order('desc')
    .first()
}

export async function getStateAt(ctx: QueryCtx, args: { id: string; observedAt: number }) {
  return ctx.db
    .query('catalog_providers')
    .withIndex('by_entity_id__observedAt', (q) =>
      q.eq('entity.id', args.id).lte('observedAt', args.observedAt),
    )
    .order('desc')
    .first()
}

export const listStates = defineQuerySpec({
  args: {},
  handler: async (ctx) =>
    stream(ctx.db, schema)
      .query('catalog_providers')
      .withIndex('by_entity_id__observedAt')
      .order('desc')
      .distinct(['entity.id'])
      .collect(),
})

async function getContent(ctx: QueryCtx, state: State) {
  return ctx.db.get(state.rowId)
}

async function hydrate(ctx: QueryCtx, state: State) {
  const content = await getContent(ctx, state)

  if (!content) {
    throw new ConvexError({
      message: 'content not found',
      id: state.entity.id,
      rowId: state.rowId,
    })
  }

  return {
    state,
    content,
  }
}

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
  },
  handler: async (ctx, args) =>
    stream(ctx.db, schema)
      .query('catalog_providers')
      .withIndex('by_entity_id__observedAt')
      .order('desc')
      .distinct(['entity.id'])
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
      .query('catalog_providers')
      .withIndex('by_entity_id__observedAt', (q) => q.eq('entity.id', args.id))
      .order('desc')
      .map(async (state) => hydrate(ctx, state))
      .paginate(args.paginationOpts),
})
