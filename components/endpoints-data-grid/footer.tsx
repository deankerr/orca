import { useDataGrid } from '../data-grid/data-grid'
import { useEndpointsData } from './api'
import { useEndpointFilters } from './use-endpoint-filters'

export function DataGridFooter() {
  'use no memo'
  const { table } = useDataGrid()
  const { rawEndpoints, isLoading } = useEndpointsData()
  const { hasActiveFilters } = useEndpointFilters()

  if (isLoading) {
    return null
  }

  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <div>
      {hasActiveFilters ? `${filteredCount} /` : ''} {rawEndpoints.length} endpoints
    </div>
  )
}
