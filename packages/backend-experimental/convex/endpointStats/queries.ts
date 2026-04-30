import { omit } from 'convex-helpers'
import { v } from 'convex/values'

import { defineQuerySpec } from '../lib/functionSpec'

export const get = defineQuerySpec({
  args: { endpointId: v.string() },
  handler: async (ctx, args) =>
    ctx.db
      .query('endpoint_stats_samples')
      .withIndex('by_endpointId__observedAt', (q) => q.eq('endpointId', args.endpointId))
      .order('desc')
      .first()
      .then((doc) =>
        doc
          ? omit(doc, [
              'p75Latency',
              'p75Throughput',
              'p90Latency',
              'p90Throughput',
              'p99Latency',
              'p99Throughput',
            ])
          : null,
      ),
})

export const listForModel = defineQuerySpec({
  args: {
    modelId: v.string(),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) =>
    ctx.db
      .query('endpoint_stats_samples')
      .withIndex('by_modelId__observedAt', (q) =>
        q.eq('modelId', args.modelId).gte('observedAt', args.since ?? 0),
      )
      .collect()
      .then((docs) =>
        docs.map((doc) =>
          omit(doc, [
            'p75Latency',
            'p75Throughput',
            'p90Latency',
            'p90Throughput',
            'p99Latency',
            'p99Throughput',
          ]),
        ),
      ),
})
