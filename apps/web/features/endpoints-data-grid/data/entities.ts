import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/api'

export function gridQueryOptions() {
  return {
    endpoints: convexQuery(api.catalog.endpoints.query.grid, {}),
    stats: convexQuery(api.catalog.stats.query.grid, {}),
  }
}
