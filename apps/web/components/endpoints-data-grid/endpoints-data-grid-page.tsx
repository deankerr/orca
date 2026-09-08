'use client'

import { useEndpoints } from '@/lib/v3/entities'
import { buildGridEndpoints } from '@/lib/v3/grid-endpoints'

import { EndpointsDataGrid } from './endpoints-data-grid'

export function EndpointsDataGridPage() {
  const { data, isPending } = useEndpoints()
  const rows = buildGridEndpoints(data ?? [])

  return <EndpointsDataGrid endpoints={rows} isPending={isPending} />
}
