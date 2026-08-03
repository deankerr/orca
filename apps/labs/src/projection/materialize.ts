import type { CoreEndpoint, CoreModel } from '@orca/schema/archive-core.ts'
import * as Core from '@orca/schema/archive-core.ts'
import * as Schema from 'effect/Schema'

import type { CorpusCrawl } from '../corpus/types.ts'
import { isRecord } from '../transform/json.ts'
import type { JsonRecord } from '../transform/json.ts'
import type { EndpointMetrics, MaterializedEndpoint, ProjectionBatch } from './types.ts'

const decodeModel = Schema.decodeUnknownSync(Core.CoreModel)
const decodeEndpoint = Schema.decodeUnknownSync(Core.CoreEndpoint)

const readMetrics = (endpoint: JsonRecord): EndpointMetrics | undefined => {
  if (!isRecord(endpoint.stats)) {
    return undefined
  }
  const p50Latency = endpoint.stats.p50_latency
  const p50Throughput = endpoint.stats.p50_throughput
  const metrics = {
    ...(typeof p50Latency === 'number' ? { p50Latency } : {}),
    ...(typeof p50Throughput === 'number' ? { p50Throughput } : {}),
  }
  return Object.keys(metrics).length === 0 ? undefined : metrics
}

export const materialize = (crawl: CorpusCrawl): ProjectionBatch => {
  const models = new Map<string, CoreModel>()
  const endpoints = new Map<string, MaterializedEndpoint>()

  // `crawl.models` has already been derived exclusively from endpoint-embedded model copies.
  // Do not accept scope models here: see `corpus/dedupe.ts` and the production materializer rule.
  for (const rawModel of crawl.models) {
    const model = decodeModel(rawModel)
    models.set(model.slug, model)
  }
  for (const item of crawl.endpoints) {
    const endpoint: CoreEndpoint = decodeEndpoint(item.data)
    endpoints.set(endpoint.id, {
      endpoint,
      metrics: readMetrics(item.data),
      modelSlug: item.modelSlug,
    })
  }

  return {
    crawlId: crawl.crawlId,
    endpoints: [...endpoints.values()].toSorted((left, right) =>
      left.endpoint.id.localeCompare(right.endpoint.id),
    ),
    models: [...models.values()].toSorted((left, right) => left.slug.localeCompare(right.slug)),
  }
}
