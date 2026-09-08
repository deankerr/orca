'use client'

import { useEndpoints, useModels, useProviders } from '@/lib/v3/entities'
import { buildGridEndpoints } from '@/lib/v3/grid-endpoints'

import { EndpointsDataGrid } from './endpoints-data-grid'

export function EndpointsDataGridPage() {
  const endpoints = useEndpoints()
  const models = useModels()
  const providers = useProviders()
  const isPending = endpoints.isPending || models.isPending || providers.isPending
  const rows = isPending
    ? []
    : buildGridEndpoints(endpoints.data ?? [], models.data ?? [], providers.data ?? [])

  return <EndpointsDataGrid endpoints={rows} isPending={isPending} />
}
