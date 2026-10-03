'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from '@tanstack/react-query'

export function useEndpoints() {
  return useQuery(convexQuery(api.catalog.endpoints.query.grid, {}))
}

export function useStats() {
  return useQuery(convexQuery(api.catalog.stats.query.grid, {}))
}
