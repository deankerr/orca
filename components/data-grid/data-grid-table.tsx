import type { Cell, Column, Header, HeaderGroup, Row } from '@tanstack/react-table'
import { flexRender } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cva } from 'class-variance-authority'
import { InboxIcon } from 'lucide-react'
import * as React from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Fragment, useCallback, useRef } from 'react'

import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

import { useDataGrid } from './data-grid'
import { DataGridSkeleton } from './data-grid-skeleton'

const headerCellSpacingVariants = cva('', {
  variants: {
    size: {
      dense: 'px-2.5 h-8',
      default: 'px-4',
    },
  },
  defaultVariants: {
    size: 'default',
  },
})

const bodyCellSpacingVariants = cva('', {
  variants: {
    size: {
      dense: 'px-2.5 py-2',
      default: 'px-4 py-3',
    },
  },
  defaultVariants: {
    size: 'default',
  },
})

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
  const columnsDraggable = props.tableLayout?.columnsDraggable === true
  const fixedWidth = props.tableLayout?.width === 'fixed'

  return (
    <table
      data-slot="data-grid-table"
      className={cn(
        'w-full caption-bottom text-left align-middle text-sm font-normal text-foreground rtl:text-right',
        !columnsDraggable && 'border-separate border-spacing-0',
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
  const transparentHeaderBackground = props.tableLayout?.headerBackground === false

  return (
    <tr
      key={headerGroup.id}
      data-slot="data-grid-table-head-row"
      className={cn(
        'bg-muted/40',
        hasCellBorder && '*:last:border-e-0',
        transparentHeaderBackground && 'bg-transparent',
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
  dndRef,
  dndStyle,
}: {
  children: ReactNode
  header: Header<TData, unknown>
  dndRef?: React.Ref<HTMLTableCellElement>
  dndStyle?: CSSProperties
}) {
  'use no memo'
  const { props } = useDataGrid()

  const { column } = header
  const isPinned = column.getIsPinned()
  const pinnedSide = isPinned === false ? undefined : isPinned
  const isLastLeftPinned = isPinned === 'left' && column.getIsLastColumn('left')
  const isFirstRightPinned = isPinned === 'right' && column.getIsFirstColumn('right')
  const isDense = props.tableLayout?.dense === true
  const columnsPinnable = props.tableLayout?.columnsPinnable === true
  const widthFixed = props.tableLayout?.width === 'fixed'
  const hasCellBorder = props.tableLayout?.cellBorder === true
  const columnsResizable = props.tableLayout?.columnsResizable === true
  const hasHeaderBorder = props.tableLayout?.headerBorder === true
  const headerCellSpacing = headerCellSpacingVariants({
    size: isDense ? 'dense' : 'default',
  })

  const pinningStyles = columnsPinnable && column.getCanPin() ? getPinningStyles(column) : undefined
  const needsStickyTop =
    props.tableLayout?.headerSticky === true && pinningStyles?.position === 'sticky'

  return (
    <th
      key={header.id}
      ref={dndRef}
      style={{
        ...(widthFixed && {
          width: `${header.getSize()}px`,
        }),
        ...pinningStyles,
        ...(needsStickyTop && { top: 0, zIndex: 11 }),
        ...dndStyle,
      }}
      data-pinned={pinnedSide}
      data-last-col={isLastLeftPinned ? 'left' : isFirstRightPinned ? 'right' : undefined}
      data-slot="data-grid-table-head-row-cell"
      className={cn(
        'h-12 align-middle text-xs font-normal text-accent-foreground rtl:text-right [&:has([role=checkbox])]:pe-0',
        headerCellSpacing,
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
  return <tbody aria-hidden="true" className="h-2"></tbody>
}

function DataGridTableBody({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()
  const rowRounded = props.tableLayout?.rowRounded === true

  return (
    <tbody
      className={cn(
        rowRounded && '[&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg',
        props.tableClassNames?.body,
      )}
    >
      {children}
    </tbody>
  )
}

function DataGridTableBodyRow<TData>({
  children,
  row,
  dndRef,
  dndStyle,
}: {
  children: ReactNode
  row: Row<TData>
  dndRef?: React.Ref<HTMLTableRowElement>
  dndStyle?: CSSProperties
}) {
  'use no memo'
  const { props } = useDataGrid()

  // Compute dynamic data attributes from row data
  const dynamicAttrs = props.rowDataAttributes?.(row.original)
  const isSelectableRow = row.getCanSelect()
  const hasRowClick = props.onRowClick !== undefined
  const hasRowBorder = props.tableLayout?.rowBorder === true
  const hasCellBorder = props.tableLayout?.cellBorder === true

  return (
    <tr
      ref={dndRef}
      style={dndStyle ?? undefined}
      data-state={isSelectableRow && row.getIsSelected() ? 'selected' : undefined}
      {...dynamicAttrs}
      onClick={() => {
        props.onRowClick?.(row.original)
      }}
      className={cn(
        'group data-[state=selected]:bg-muted/50',
        hasRowClick && 'cursor-pointer',
        hasRowBorder && '[&>td]:border-b [&>td]:border-border-solid',
        hasCellBorder && '*:last:border-e-0',
        isSelectableRow && '*:first:relative',
        props.tableClassNames?.bodyRow,
      )}
    >
      {children}
    </tr>
  )
}

function DataGridTableBodyRowExpanded<TData>({ row }: { row: Row<TData> }) {
  const { props, table } = useDataGrid()
  const hasRowBorder = props.tableLayout?.rowBorder === true

  return (
    <tr className={cn(hasRowBorder && '[&>td]:border-b [&>td]:border-border-solid')}>
      <td colSpan={row.getVisibleCells().length}>
        {table
          .getAllColumns()
          .find((column) => column.columnDef.meta?.expandedContent)
          ?.columnDef.meta?.expandedContent?.(row.original)}
      </td>
    </tr>
  )
}

function DataGridTableBodyRowCell<TData>({
  children,
  cell,
  dndRef,
  dndStyle,
}: {
  children: ReactNode
  cell: Cell<TData, unknown>
  dndRef?: React.Ref<HTMLTableCellElement>
  dndStyle?: CSSProperties
}) {
  'use no memo'
  const { props } = useDataGrid()

  const { column, row } = cell
  const isPinned = column.getIsPinned()
  const pinnedSide = isPinned === false ? undefined : isPinned
  const isLastLeftPinned = isPinned === 'left' && column.getIsLastColumn('left')
  const isFirstRightPinned = isPinned === 'right' && column.getIsFirstColumn('right')
  const isDense = props.tableLayout?.dense === true
  const columnsDraggable = props.tableLayout?.columnsDraggable === true
  const columnsPinnable = props.tableLayout?.columnsPinnable === true
  const hasCellBorder = props.tableLayout?.cellBorder === true
  const columnsResizable = props.tableLayout?.columnsResizable === true
  const bodyCellSpacing = bodyCellSpacingVariants({
    size: isDense ? 'dense' : 'default',
  })

  return (
    <td
      key={cell.id}
      ref={dndRef}
      {...(columnsDraggable && isPinned === false ? { cell } : {})}
      style={{
        ...(columnsPinnable && column.getCanPin() && getPinningStyles(column)),
        ...dndStyle,
      }}
      data-pinned={pinnedSide}
      data-last-col={isLastLeftPinned ? 'left' : isFirstRightPinned ? 'right' : undefined}
      className={cn(
        'align-middle',
        bodyCellSpacing,
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

function DataGridTableRowSelect<TData>({ row }: { row: Row<TData> }) {
  return (
    <>
      <div
        className={cn(
          'absolute start-0 top-0 bottom-0 hidden w-[2px] bg-primary',
          row.getIsSelected() && 'block',
        )}
      ></div>
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => {
          row.toggleSelected(value)
        }}
        aria-label="Select row"
        className="align-[inherit]"
      />
    </>
  )
}

function DataGridTableRowSelectAll() {
  const { table, recordCount, isLoading } = useDataGrid()

  return (
    <Checkbox
      checked={table.getIsAllPageRowsSelected()}
      indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
      disabled={isLoading || recordCount === 0}
      onCheckedChange={(value) => {
        table.toggleAllPageRowsSelected(value)
      }}
      aria-label="Select all"
      className="align-[inherit]"
    />
  )
}

function DataGridTableVirtual<TData>() {
  'use no memo'
  const { table, isLoading, props } = useDataGrid()
  const scrollElementRef = useRef<HTMLDivElement>(null)
  const rowHeight = props.tableLayout?.rowHeight ?? 58.5
  const overscan = props.tableLayout?.overscan ?? 3
  const columnsResizable = props.tableLayout?.columnsResizable === true
  const hasRowBorder = props.tableLayout?.rowBorder === true

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => scrollElementRef.current,
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
    <div ref={scrollElementRef} className="flex-1 overflow-auto overscroll-none">
      <DataGridTableBase>
        <DataGridTableHead>
          {table.getHeaderGroups().map((headerGroup: HeaderGroup<TData>) => (
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
                    {row.getVisibleCells().map((cell: Cell<TData, unknown>) => (
                      <DataGridTableBodyRowCell cell={cell} key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </DataGridTableBodyRowCell>
                    ))}
                  </DataGridTableBodyRow>
                  {row.getIsExpanded() && <DataGridTableBodyRowExpanded row={row} />}
                </Fragment>
              )
            })
          ) : (
            <DataGridTableEmpty />
          )}

          {paddingBottom > 0 && (
            <tr>
              <td style={{ height: `${paddingBottom}px` }} />
            </tr>
          )}
        </DataGridTableBody>
      </DataGridTableBase>
    </div>
  )
}

export {
  DataGridTableVirtual,
  DataGridTableBase,
  DataGridTableBody,
  DataGridTableBodyRow,
  DataGridTableBodyRowCell,
  DataGridTableBodyRowExpanded,
  DataGridTableEmpty,
  DataGridTableHead,
  DataGridTableHeadRow,
  DataGridTableHeadRowCell,
  DataGridTableHeadRowCellResize,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
  DataGridTableRowSpacer,
}
