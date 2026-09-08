'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from '@tanstack/react-query'

export function useModels() {
  return useQuery(convexQuery(api.v3.public.models.list, {}))
}

export function useProviders() {
  return useQuery(convexQuery(api.v3.public.providers.list, {}))
}

export function useEndpoints() {
  return useQuery(convexQuery(api.v3.public.endpoints.list, {}))
}

export function useStats() {
  return useQuery(convexQuery(api.v3.public.stats.list, {}))
}
