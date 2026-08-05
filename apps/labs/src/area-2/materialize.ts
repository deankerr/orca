import * as Core from '@orca/schema/area-2-core.ts'
import type { CoreEndpoint, CoreModel } from '@orca/schema/area-2-core.ts'
import * as Schema from 'effect/Schema'
import * as SchemaTransformation from 'effect/SchemaTransformation'

import type { RawModelScope } from './bundle-reader.ts'

export interface MaterializedEndpoint {
  readonly endpoint: Omit<CoreEndpoint, 'stats' | 'model'>
  readonly metrics: EndpointMetrics | undefined
  readonly modelSlug: string
}

export interface MaterializedCrawl {
  readonly crawlId: string
  readonly endpoints: readonly MaterializedEndpoint[]
  readonly models: readonly CoreModel[]
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
  scopes: readonly RawModelScope[],
): {
  readonly endpoints: readonly MaterializedEndpoint[]
  readonly models: readonly CoreModel[]
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
