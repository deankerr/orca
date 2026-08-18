import { internalQuery } from '../../_generated/server'
import type { OrcaPublicApiV2 } from './schema'
import { transformEndpointsToV2Models } from './transform'

function findMaxUpdatedAt(items: { updated_at: number }[]) {
  let max = 0

  for (const item of items) {
    if (item.updated_at > max) {
      max = item.updated_at
    }
  }

  return max
}

export const get = internalQuery({
  args: {},
  handler: async (ctx): Promise<OrcaPublicApiV2> => {
    const endpoints = await ctx.db
      .query('or_views_endpoints')
      .withIndex('by_unavailable_at', (q) => q.eq('unavailable_at', undefined))
      .filter((q) => q.eq(q.field('disabled'), false))
      .collect()

    const models = transformEndpointsToV2Models({ endpoints })
    const updated_at = new Date(findMaxUpdatedAt(endpoints)).toISOString()

    return { updated_at, models }
  },
})
