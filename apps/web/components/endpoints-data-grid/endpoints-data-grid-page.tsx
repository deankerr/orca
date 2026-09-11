'use client'

import { useEndpoints, useStats } from '@/lib/v3/entities'
import { buildGridEndpoints } from '@/lib/v3/grid-endpoints'

import { EndpointsDataGrid } from './endpoints-data-grid'

export function EndpointsDataGridPage() {
  const endpoints = useEndpoints()
  const stats = useStats()
  const rows = buildGridEndpoints(endpoints.data ?? [], stats.data ?? [])

  return <EndpointsDataGrid endpoints={rows} isPending={endpoints.isPending || stats.isPending} />
}
