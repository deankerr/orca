import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/api'

export function gridQueryOptions() {
  return {
    endpoints: convexQuery(api.products.grid.endpoints.grid, {}),
    stats: convexQuery(api.products.grid.stats.grid, {}),
  }
}
