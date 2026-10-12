import type { api } from '@orca/backend/api'
import type { FunctionReturnType } from 'convex/server'

/** Compose current endpoint details and readings without falling back to historical stats. */
export function buildGridEndpoints(
  endpoints: FunctionReturnType<typeof api.products.grid.endpoints.grid>,
  stats: FunctionReturnType<typeof api.products.grid.stats.grid>['rows'],
) {
  const readings = new Map(stats.map((reading) => [reading.endpoint_id, reading]))
  return endpoints.map((endpoint) => ({
    ...endpoint,
    stats: endpoint.unlisted_at === undefined ? readings.get(endpoint.endpoint_id) : undefined,
  }))
}

export type GridEndpoint = ReturnType<typeof buildGridEndpoints>[number]
