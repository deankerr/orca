import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const statFields = {
  p50Latency: v.optional(v.number()),
  p50Throughput: v.optional(v.number()),
  p75Latency: v.optional(v.number()),
  p75Throughput: v.optional(v.number()),
  p90Latency: v.optional(v.number()),
  p90Throughput: v.optional(v.number()),
  p95Latency: v.optional(v.number()),
  p95Throughput: v.optional(v.number()),
  p99Latency: v.optional(v.number()),
  p99Throughput: v.optional(v.number()),
  requestCount: v.optional(v.number()),
  windowMinutes: v.optional(v.number()),
}

export const samplesTable = defineTable({
  endpointId: v.string(),
  modelId: v.string(),
  observedAt: v.number(),
  providerId: v.string(),
  statsObserved: v.boolean(),
  ...statFields,
})
  .index('by_endpointId__observedAt', ['endpointId', 'observedAt'])
  .index('by_modelId__observedAt', ['modelId', 'observedAt'])
  .index('by_observedAt', ['observedAt'])
