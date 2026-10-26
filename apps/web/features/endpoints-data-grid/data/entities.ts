import { api } from '@orca/backend/api'

import { convexQueryOptions } from '@/lib/convex-query'

export function gridQueryOptions() {
  return {
    endpoints: convexQueryOptions(api.products.grid.endpoints.grid, {}),
    stats: convexQueryOptions(api.products.grid.stats.grid, {}),
  }
}
