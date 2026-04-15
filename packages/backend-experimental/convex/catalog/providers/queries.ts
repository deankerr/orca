import { stream } from 'convex-helpers/server/stream'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import type { QueryCtx } from '../../_generated/server'
import { defineQuerySpec } from '../../lib/functionSpec'
import schema from '../../schema'

async function getProvider(ctx: QueryCtx, id: string) {
  return ctx.db
    .query('catalog_providers')
    .withIndex('by_id__first_seen_at', (q) => q.eq('id', id))
    .order('desc')
    .first()
}

export const get = defineQuerySpec({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => getProvider(ctx, args.id),
})

export const list = defineQuerySpec({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    stream(ctx.db, schema)
      .query('catalog_providers')
      .withIndex('by_id__first_seen_at')
      .order('desc')
      .distinct(['id'])
      .paginate(args.paginationOpts),
})
