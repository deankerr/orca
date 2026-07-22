'use client'

import { api } from '@orca/backend/convex/_generated/api'
import ms from 'ms'

import { useCachedQuery } from '@/hooks/use-cached-query'

const UNAVAILABLE_WINDOW_MS = ms('30d')

export function useModelEndpoints(modelSlug: string) {
  return useCachedQuery(api.endpoints.listForModel, {
    modelSlug,
    maxTimeUnavailable: UNAVAILABLE_WINDOW_MS,
  })
}
