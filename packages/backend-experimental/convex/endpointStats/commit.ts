import { v } from 'convex/values'

import { defineMutationSpec } from '../lib/functionSpec'
import { statFields } from './schema'

export const insertSample = defineMutationSpec({
  args: {
    endpointId: v.string(),
    modelId: v.string(),
    observedAt: v.number(),
    providerId: v.string(),
    stats: v.optional(v.object(statFields)),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert('endpoint_stats_samples', {
      endpointId: args.endpointId,
      modelId: args.modelId,
      observedAt: args.observedAt,
      providerId: args.providerId,
      statsObserved: args.stats !== undefined,
      ...args.stats,
    })
  },
})
