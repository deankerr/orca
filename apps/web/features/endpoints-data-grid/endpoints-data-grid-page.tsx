'use client'

import { useQuery } from '@tanstack/react-query'

import { gridQueryOptions } from './data/entities'
import { buildGridEndpoints } from './data/grid-endpoints'
import { useGridLoadTiming, useGridLoadTimingStart } from './data/use-grid-load-timing'
import { EndpointsDataGrid } from './endpoints-data-grid'

export function EndpointsDataGridPage() {
  const options = gridQueryOptions()
  const measurement = useGridLoadTimingStart({
    endpoints: options.endpoints.queryKey,
    stats: options.stats.queryKey,
  })
  const endpoints = useQuery(options.endpoints)
  const stats = useQuery(options.stats)
  const rows = buildGridEndpoints(endpoints.data ?? [], stats.data?.rows ?? [])
  useGridLoadTiming(measurement, endpoints, stats)

  return <EndpointsDataGrid endpoints={rows} isPending={endpoints.isPending || stats.isPending} />
}
