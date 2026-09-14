'use client'

import { useEndpoints, useStats } from './data/entities'
import { buildGridEndpoints } from './data/grid-endpoints'
import { EndpointsDataGrid } from './endpoints-data-grid'

export function EndpointsDataGridPage() {
  const endpoints = useEndpoints()
  const stats = useStats()
  const rows = buildGridEndpoints(endpoints.data ?? [], stats.data ?? [])

  return <EndpointsDataGrid endpoints={rows} isPending={endpoints.isPending || stats.isPending} />
}
