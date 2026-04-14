import { useDataGrid } from '../data-grid/data-grid'

export function DataGridFooter({
  totalCount,
  hasActiveFilters,
  isLoading,
}: {
  totalCount: number
  hasActiveFilters: boolean
  isLoading: boolean
}) {
  'use no memo'
  const { table } = useDataGrid()

  if (isLoading) {
    return null
  }

  const filteredCount = table.getFilteredRowModel().rows.length

  return (
    <div>
      {hasActiveFilters ? `${filteredCount} /` : ''} {totalCount} endpoints
    </div>
  )
}
