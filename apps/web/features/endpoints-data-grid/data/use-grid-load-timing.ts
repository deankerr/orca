import { useQueryClient } from '@tanstack/react-query'
import type { QueryKey, UseQueryResult } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState } from 'react'

import { captureTiming } from '@/features/product-readiness/capture'
import { startReadiness } from '@/features/product-readiness/measurement'
import { useQueryResult } from '@/features/product-readiness/use-query-result'

export function useGridLoadTimingStart(keys: { endpoints: QueryKey; stats: QueryKey }) {
  const client = useQueryClient()
  // oxlint-disable-next-line react/hook-use-state -- Immutable span identity per mount.
  const [load] = useState(() => {
    const endpoints = startReadiness(client, keys.endpoints, 'grid')
    return { endpoints, stats: { ...startReadiness(client, keys.stats, 'grid'), id: endpoints.id } }
  })
  return load
}

export function useGridLoadTiming(
  load: ReturnType<typeof useGridLoadTimingStart>,
  endpoints: UseQueryResult,
  stats: UseQueryResult,
) {
  useQueryResult(load.endpoints, endpoints.isSuccess)
  useQueryResult(load.stats, stats.isSuccess)
  const reported = useRef(false)
  useLayoutEffect(() => {
    if (reported.current || !endpoints.isSuccess || !stats.isSuccess) {
      return
    }
    reported.current = true
    captureTiming('grid ready', {
      view_load_id: load.endpoints.id,
      elapsed_ms: performance.now() - load.endpoints.started.at,
      signal: 'content_commit',
    })
  }, [load, endpoints.isSuccess, stats.isSuccess])
}
