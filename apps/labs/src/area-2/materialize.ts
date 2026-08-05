import * as Core2 from '@orca/schema/area-2-core.ts'
import type { CoreEndpoint, CoreModel } from '@orca/schema/area-2-core.ts'
import * as Schema from 'effect/Schema'
import * as SchemaTransformation from 'effect/SchemaTransformation'

import type { JsonRecord } from './bundle-reader.ts'

export interface MaterializedEndpoint {
  readonly endpoint: Omit<CoreEndpoint, 'stats' | 'model'>
  readonly metrics: EndpointMetrics | undefined
  readonly modelSlug: string
}

const EndpointMetrics = Schema.Struct({
  p50Latency: Schema.Number,
  p50Throughput: Schema.Number,
})
export type EndpointMetrics = Schema.Schema.Type<typeof EndpointMetrics>

const RawEndpointWithModel = Schema.Struct({
  ...Core2.CoreEndpoint.fields,
  model: Core2.CoreModel,
  stats: Schema.optional(
    Core2.CoreEndpointStats.pipe(
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
 * Converts selected raw model scopes into the stable core projection. Scope models select endpoints,
 * while embedded endpoint models are authoritative; the last copy for a model slug or endpoint id wins.
 */
export const materialize = (
  scopes: readonly {
    readonly endpoints: readonly JsonRecord[]
    readonly model: JsonRecord
  }[],
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
