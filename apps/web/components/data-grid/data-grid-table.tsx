import type { Cell, Column, Header, HeaderGroup, Row } from '@tanstack/react-table'
import { flexRender } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { InboxIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Fragment, useCallback, useRef } from 'react'

import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { useDataGrid } from './data-grid'
import { DataGridSkeleton } from './data-grid-skeleton'

function getPinningStyles<TData>(column: Column<TData>): CSSProperties {
  const isPinned = column.getIsPinned()
  const isPinnedLeft = isPinned === 'left'
  const isPinnedRight = isPinned === 'right'
  const isPinnedColumn = isPinned !== false

  return {
    left: isPinnedLeft ? `${column.getStart('left')}px` : undefined,
    right: isPinnedRight ? `${column.getAfter('right')}px` : undefined,
    position: isPinnedColumn ? 'sticky' : 'relative',
    width: column.getSize(),
    zIndex: isPinnedColumn ? 1 : 0,
  }
}

function DataGridTableBase({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()
  const fixedWidth = props.tableLayout?.width === 'fixed'

  return (
    <table
      data-slot="data-grid-table"
      className={cn(
        'w-full caption-bottom text-left align-middle text-sm font-normal text-foreground rtl:text-right',
        'border-separate border-spacing-0',
        fixedWidth ? 'table-fixed' : 'table-auto',
        props.tableClassNames?.base,
      )}
    >
      {children}
    </table>
  )
}

function DataGridTableHead({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()
  const headerSticky = props.tableLayout?.headerSticky === true

  return (
    <thead
      className={cn(
        props.tableClassNames?.header,
        headerSticky && props.tableClassNames?.headerSticky,
      )}
    >
      {children}
    </thead>
  )
}

function DataGridTableHeadRow<TData>({
  children,
  headerGroup,
}: {
  children: ReactNode
  headerGroup: HeaderGroup<TData>
}) {
  const { props } = useDataGrid()
  const hasCellBorder = props.tableLayout?.cellBorder === true

  return (
    <tr
      key={headerGroup.id}
      data-slot="data-grid-table-head-row"
      className={cn(
        'bg-muted/40',
        hasCellBorder && '*:last:border-e-0',
        props.tableClassNames?.headerRow,
      )}
    >
      {children}
    </tr>
  )
}

function DataGridTableHeadRowCell<TData>({
  children,
  header,
}: {
  children: ReactNode
  header: Header<TData, unknown>
}) {
  'use no memo'
  const { props } = useDataGrid()

  const { column } = header
  const isPinned = column.getIsPinned()
  const pinnedSide = isPinned === false ? undefined : isPinned
  const isLastLeftPinned = isPinned === 'left' && column.getIsLastColumn('left')
  const isFirstRightPinned = isPinned === 'right' && column.getIsFirstColumn('right')
  const columnsPinnable = props.tableLayout?.columnsPinnable === true
  const widthFixed = props.tableLayout?.width === 'fixed'
  const hasCellBorder = props.tableLayout?.cellBorder === true
  const columnsResizable = props.tableLayout?.columnsResizable === true
  const hasHeaderBorder = props.tableLayout?.headerBorder === true

  const pinningStyles = columnsPinnable && column.getCanPin() ? getPinningStyles(column) : undefined
  const needsStickyTop =
    props.tableLayout?.headerSticky === true && pinningStyles?.position === 'sticky'

  return (
    <th
      key={header.id}
      style={{
        ...(widthFixed && {
          width: `${header.getSize()}px`,
        }),
        ...pinningStyles,
        ...(needsStickyTop && { top: 0, zIndex: 11 }),
      }}
      data-pinned={pinnedSide}
      data-last-col={isLastLeftPinned ? 'left' : isFirstRightPinned ? 'right' : undefined}
      data-slot="data-grid-table-head-row-cell"
      className={cn(
        'h-12 align-middle text-xs font-normal text-accent-foreground rtl:text-right [&:has([role=checkbox])]:pe-0',
        'data-pinned:bg-muted-hover data-[last-col=left]:border-e data-[last-col=left]:border-border-solid data-[last-col=right]:border-s data-[last-col=right]:border-border-solid',
        props.tableClassNames?.headerCell,
        hasCellBorder && 'border-e',
        columnsResizable && column.getCanResize() && 'truncate',
        columnsPinnable &&
          column.getCanPin() &&
          '[&:not([data-pinned]):has(+[data-pinned])_div.cursor-col-resize:last-child]:opacity-0 [&[data-last-col=left]_div.cursor-col-resize:last-child]:opacity-0 [&[data-pinned=right]:last-child_div.cursor-col-resize:last-child]:opacity-0',
        header.column.columnDef.meta?.headerClassName,
        column.getIndex() === 0 || column.getIndex() === header.headerGroup.headers.length - 1
          ? props.tableClassNames?.edgeCell
          : '',
      )}
    >
      {children}
      {/* NOTE: header border-b replacement that remains in place with sticky headers */}
      {hasHeaderBorder && <div className="absolute bottom-0 left-0 h-px w-full bg-border-solid" />}
    </th>
  )
}

function DataGridTableHeadRowCellResize<TData>({ header }: { header: Header<TData, unknown> }) {
  const { column } = header

  return (
    <div
      {...{
        onDoubleClick: () => {
          column.resetSize()
        },
        onMouseDown: header.getResizeHandler(),
        onTouchStart: header.getResizeHandler(),
        className:
          'absolute top-0 h-full w-4 cursor-col-resize user-select-none touch-none -end-2 z-10 flex justify-center before:absolute before:w-px before:inset-y-0 before:bg-border-solid translate-x-px',
      }}
    />
  )
}

function DataGridTableRowSpacer() {
  return <tbody aria-hidden="true" className="h-2" />
}

function DataGridTableBody({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()

  return <tbody className={props.tableClassNames?.body}>{children}</tbody>
}

function DataGridTableBodyRow<TData>({ children, row }: { children: ReactNode; row: Row<TData> }) {
  'use no memo'
  const { props } = useDataGrid()

  const dynamicAttrs = props.rowDataAttributes?.(row.original)
  const hasRowClick = props.onRowClick !== undefined
  const hasRowBorder = props.tableLayout?.rowBorder === true
  const hasCellBorder = props.tableLayout?.cellBorder === true

  return (
    <tr
      {...dynamicAttrs}
      onClick={() => {
        props.onRowClick?.(row.original)
      }}
      className={cn(
        'group',
        hasRowClick && 'cursor-pointer',
        hasRowBorder && '[&>td]:border-b [&>td]:border-border-solid',
        hasCellBorder && '*:last:border-e-0',
        props.tableClassNames?.bodyRow,
      )}
    >
      {children}
    </tr>
  )
}

function DataGridTableBodyRowCell<TData>({
  children,
  cell,
}: {
  children: ReactNode
  cell: Cell<TData, unknown>
}) {
  'use no memo'
  const { props } = useDataGrid()

  const { column, row } = cell
  const isPinned = column.getIsPinned()
  const pinnedSide = isPinned === false ? undefined : isPinned
  const isLastLeftPinned = isPinned === 'left' && column.getIsLastColumn('left')
  const isFirstRightPinned = isPinned === 'right' && column.getIsFirstColumn('right')
  const columnsPinnable = props.tableLayout?.columnsPinnable === true
  const hasCellBorder = props.tableLayout?.cellBorder === true
  const columnsResizable = props.tableLayout?.columnsResizable === true

  return (
    <td
      key={cell.id}
      style={{
        ...(columnsPinnable && column.getCanPin() && getPinningStyles(column)),
      }}
      data-pinned={pinnedSide}
      data-last-col={isLastLeftPinned ? 'left' : isFirstRightPinned ? 'right' : undefined}
      className={cn(
        'align-middle',
        'data-[last-col=left]:border-e data-[last-col=left]:border-border-solid data-[last-col=right]:border-s data-[last-col=right]:border-border-solid',
        props.tableClassNames?.bodyCell,
        hasCellBorder && 'border-e',
        columnsResizable && column.getCanResize() && 'truncate',
        cell.column.columnDef.meta?.cellClassName,
        column.getIndex() === 0 || column.getIndex() === row.getVisibleCells().length - 1
          ? props.tableClassNames?.edgeCell
          : '',
      )}
    >
      {children}
    </td>
  )
}

function DataGridTableEmpty() {
  const { table, props } = useDataGrid()
  const totalColumns = table.getAllColumns().length

  return (
    <tr>
      <td colSpan={totalColumns}>
        <div className="sticky right-0 left-0 flex w-screen max-w-full items-center justify-center py-12">
          {props.emptyMessage ?? (
            <Empty className="border-none">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <InboxIcon />
                </EmptyMedia>
                <EmptyTitle>No data available</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </td>
    </tr>
  )
}

function DataGridTableVirtual() {
  'use no memo'
  const { table, isLoading, props } = useDataGrid()
  const viewportRef = useRef<HTMLDivElement>(null)
  const rowHeight = props.tableLayout?.rowHeight ?? 58.5
  const overscan = props.tableLayout?.overscan ?? 3
  const columnsResizable = props.tableLayout?.columnsResizable === true
  const hasRowBorder = props.tableLayout?.rowBorder === true

  // oxlint-disable-next-line react-hooks-js/incompatible-library
  const virtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: useCallback(
      (index: number) => table.getRowModel().rows[index]?.id ?? index,
      [table],
    ),
  })

  if (isLoading) {
    return <DataGridSkeleton />
  }

  const virtualRows = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const lastVirtualRow = virtualRows.at(-1)
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom = lastVirtualRow ? totalSize - lastVirtualRow.end : 0

  return (
    <ScrollArea
      viewportRef={viewportRef}
      className="min-h-0 min-w-0 flex-1 [&_[data-slot=scroll-area-scrollbar]]:z-20 [&_[data-slot=scroll-area-viewport]]:overscroll-none"
    >
      <DataGridTableBase>
        <DataGridTableHead>
          {table.getHeaderGroups().map((headerGroup) => (
            <DataGridTableHeadRow headerGroup={headerGroup} key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const { column } = header

                return (
                  <DataGridTableHeadRowCell header={header} key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {columnsResizable && column.getCanResize() && (
                      <DataGridTableHeadRowCellResize header={header} />
                    )}
                  </DataGridTableHeadRowCell>
                )
              })}
            </DataGridTableHeadRow>
          ))}
        </DataGridTableHead>

        {!hasRowBorder && <DataGridTableRowSpacer />}

        <DataGridTableBody>
          {paddingTop > 0 && (
            <tr>
              {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label - not a control */}
              <td style={{ height: `${paddingTop}px` }} />
            </tr>
          )}

          {virtualRows.length > 0 ? (
            virtualRows.map((virtualRow) => {
              const row = table.getRowModel().rows[virtualRow.index]
              if (row === undefined) {
                return null
              }

              return (
                <Fragment key={virtualRow.key}>
                  <DataGridTableBodyRow row={row}>
                    {row.getVisibleCells().map((cell) => (
                      <DataGridTableBodyRowCell cell={cell} key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </DataGridTableBodyRowCell>
                    ))}
                  </DataGridTableBodyRow>
                </Fragment>
              )
            })
          ) : (
            <DataGridTableEmpty />
          )}

          {paddingBottom > 0 && (
            <tr>
              {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label - not a control */}
              <td style={{ height: `${paddingBottom}px` }} />
            </tr>
          )}
        </DataGridTableBody>
      </DataGridTableBase>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

export { DataGridTableVirtual }
