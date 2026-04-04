import { Column } from '@tanstack/react-table'

import { Shimmer } from '@/components/shared/shimmer'
import { cn } from '@/lib/utils'

import { useDataGrid } from './data-grid'

const ROW_COUNT = 15

function DataGridSkeletonCell<TData>({
  column,
  cellBorder,
  isLast,
}: {
  column: Column<TData>
  cellBorder: boolean
  isLast: boolean
}) {
  const width = column.getSize()

  return (
    <div
      className={cn('flex shrink-0 items-center px-2.5', cellBorder && !isLast && 'border-e')}
      style={{ width }}
    >
      <Shimmer className="h-5 w-full" />
    </div>
  )
}

export function DataGridSkeleton({ className }: { className?: string }) {
  const { table, props } = useDataGrid()
  const rowHeight = props.tableLayout?.rowHeight ?? 58.5
  const columns = table.getVisibleFlatColumns()
  const cellBorder = props.tableLayout?.cellBorder ?? false

  return (
    <div className={cn('overflow-hidden font-mono', className)}>
      {/* Header spacer */}
      <div className="flex h-12 border-b border-border-solid bg-muted/40">
        {columns.map((column, colIndex) => (
          <div
            key={column.id}
            className={cn('shrink-0', cellBorder && colIndex < columns.length - 1 && 'border-e')}
            style={{ width: column.getSize() }}
          />
        ))}
      </div>

      {/* Rows with bottom fade */}
      <div style={{ maskImage: 'linear-gradient(to bottom, black 40%, transparent)' }}>
        {Array.from({ length: ROW_COUNT }, (_, i) => (
          <div key={i} className="flex border-b border-border-solid" style={{ height: rowHeight }}>
            {columns.map((column, colIndex) => (
              <DataGridSkeletonCell
                key={column.id}
                column={column}
                cellBorder={cellBorder}
                isLast={colIndex === columns.length - 1}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
