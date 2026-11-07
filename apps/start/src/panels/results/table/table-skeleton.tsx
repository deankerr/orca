import { Skeleton } from '@orca/ui/components/skeleton'
import { cn } from 'cn'

import { useFiltersCollapsed } from '#app/filters-preference'
import { useSort } from '#endpoints/hooks'

import { columnLabel, columns, columnWidthStyle, FOLD_CLASSES, skeletonFold } from './columns'
import {
  BODY_CELL_CLASS,
  CELL_PADDING_CLASS,
  HEADER_CELL_CLASS,
  TABLE_CLASS,
  tableWrapperClass,
} from './endpoint-table'
import { sortDirection } from './sorting-state'

/**
 * Rows to draw. The page cannot measure the viewport while it renders on the server, so this is more
 * than any screen shows (32px each, about 1,900px) and the region clips the rest.
 */
const ROWS = 60

const NAME_WIDTHS = ['w-32', 'w-44', 'w-28', 'w-40', 'w-36', 'w-24', 'w-48', 'w-32'] as const

const PROVIDER_WIDTHS = ['w-20', 'w-24', 'w-16', 'w-28', 'w-20', 'w-24'] as const

const FIGURE_WIDTHS = ['w-9', 'w-7', 'w-8', 'w-6'] as const

function ModelCell({ index }: { index: number }) {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-4 shrink-0 rounded-[3px]" />
      <Skeleton className={cn('h-3 rounded-sm', NAME_WIDTHS[index % NAME_WIDTHS.length])} />
    </div>
  )
}

function ProviderCell({ index }: { index: number }) {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-4 shrink-0 rounded-[3px]" />
      <Skeleton
        className={cn('h-3 rounded-sm', PROVIDER_WIDTHS[(index * 5) % PROVIDER_WIDTHS.length])}
      />
    </div>
  )
}

function FigureCell({ column, index }: { column: number; index: number }) {
  return (
    <Skeleton
      className={cn(
        'ml-auto h-3 rounded-sm',
        FIGURE_WIDTHS[(index + column) % FIGURE_WIDTHS.length],
      )}
    />
  )
}

/** A body cell by column position: Model, then Provider, then the figures. */
function BodyCell({ index, position }: { index: number; position: number }) {
  if (position === 0) {
    return <ModelCell index={index} />
  }

  if (position === 1) {
    return <ProviderCell index={index} />
  }

  return <FigureCell column={position} index={index} />
}

/**
 * The endpoint table as the route's pending state shows it: the real columns, widths, and header
 * labels, over rows of placeholders. It is decorative, and not interactive: the header's sort buttons
 * need the catalogue to act on.
 */
export function TableSkeleton() {
  const sort = useSort()
  // The server knows the Filters preference but not the page's width, so the fold is a media query.
  const trigger = skeletonFold(useFiltersCollapsed())
  const fold = FOLD_CLASSES[trigger]

  return (
    <div className={tableWrapperClass(trigger)}>
      <table className={TABLE_CLASS}>
        <colgroup>
          {columns.map((column) => (
            <col
              className={cn(fold.width, column.meta?.folds === true && fold.hidden)}
              key={column.id}
              style={columnWidthStyle(column.id ?? '', column.meta?.width)}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                className={cn(
                  HEADER_CELL_CLASS,
                  CELL_PADDING_CLASS,
                  column.meta?.folds === true && fold.hidden,
                  column.meta?.numeric === true ? 'text-right' : 'text-left',
                  sortDirection(sort, column.id ?? '') !== false && 'text-foreground',
                )}
                key={column.id}
                scope="col"
              >
                {columnLabel(column.id)}
                {column.id === 'model' && (
                  <span className={fold.only}>
                    <span className="mx-3">/</span>
                    {columnLabel('provider')}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: ROWS }, (_, index) => (
            <tr key={index}>
              {columns.map((column, position) => (
                <td
                  className={cn(
                    BODY_CELL_CLASS,
                    CELL_PADDING_CLASS,
                    column.meta?.folds === true && fold.hidden,
                  )}
                  key={column.id}
                >
                  <BodyCell index={index} position={position} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
