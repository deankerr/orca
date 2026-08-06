import * as Core from '@orca/schema/area-2-core.ts'
import type { CoreEndpoint, CoreModel } from '@orca/schema/area-2-core.ts'
import * as Schema from 'effect/Schema'
import * as SchemaTransformation from 'effect/SchemaTransformation'

interface ModelScope {
  endpoints: unknown[]
}

export interface MaterializedEndpoint {
  endpoint: Omit<CoreEndpoint, 'stats' | 'model'>
  metrics: EndpointMetrics | undefined
  modelSlug: string
}

export interface MaterializedCrawl {
  crawlId: string
  endpoints: MaterializedEndpoint[]
  models: CoreModel[]
}

const EndpointMetrics = Schema.Struct({
  p50Latency: Schema.Number,
  p50Throughput: Schema.Number,
})
export type EndpointMetrics = Schema.Schema.Type<typeof EndpointMetrics>

const RawEndpointWithModel = Schema.Struct({
  ...Core.CoreEndpoint.fields,
  model: Core.CoreModel,
  stats: Schema.optional(
    Core.CoreEndpointStats.pipe(
      Schema.decodeTo(
        EndpointMetrics,
        SchemaTransformation.transform({
          decode: (stats) => ({
            p50Latency: stats.p50_latency,
            p50Throughput: stats.p50_throughput,
          }),
          encode: (metrics) => ({
            p50_latency: metrics.p50Latency,
            p50_throughput: metrics.p50Throughput,
          }),
        }),
      ),
    ),
  ),
})

const decodeEndpoint = Schema.decodeUnknownSync(RawEndpointWithModel)

/**
 * Converts text-output raw model scopes into the selected core projection. Endpoint-embedded models
 * are authoritative; the last copy for each model slug or endpoint id wins.
 */
export const materialize = (
  scopes: ModelScope[],
): {
  endpoints: MaterializedEndpoint[]
  models: CoreModel[]
} => {
  const models = new Map<string, CoreModel>()
  const endpoints = new Map<string, MaterializedEndpoint>()

  for (const { endpoints: rawEndpoints } of scopes) {
    for (const rawEndpoint of rawEndpoints) {
      const { stats, model, ...endpoint } = decodeEndpoint(rawEndpoint)

      models.set(model.slug, model)
      endpoints.set(endpoint.id, {
        endpoint,
        metrics: stats,
        modelSlug: model.slug,
      })
    }
  }

  return {
    endpoints: [...endpoints.values()].toSorted((left, right) =>
      left.endpoint.id.localeCompare(right.endpoint.id),
    ),
    models: [...models.values()].toSorted((left, right) => left.slug.localeCompare(right.slug)),
  }
}
