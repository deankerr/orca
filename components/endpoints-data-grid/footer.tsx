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

  const filteredEndpoints = table.getFilteredRowModel().rows.map((row) => row.original)

  return (
    <div>
      {hasActiveFilters ? `${filteredEndpoints.length} /` : ''} {rawEndpoints.length} endpoints
    </div>
  )
}
