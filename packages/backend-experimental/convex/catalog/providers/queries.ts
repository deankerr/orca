import { stream } from 'convex-helpers/server/stream'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import type { QueryCtx } from '../../_generated/server'
import { defineQuerySpec } from '../../lib/functionSpec'
import schema from '../../schema'

async function getProvider(ctx: QueryCtx, slug: string) {
  return ctx.db
    .query('catalog_providers_base')
    .withIndex('by_slug_and_since_at', (q) => q.eq('slug', slug))
    .order('desc')
    .first()
}

export const get = defineQuerySpec({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => getProvider(ctx, args.slug),
})

export const list = defineQuerySpec({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) =>
    stream(ctx.db, schema)
      .query('catalog_providers_base')
      .withIndex('by_slug_and_since_at')
      .order('desc')
      .distinct(['slug'])
      .paginate(args.paginationOpts),
})
