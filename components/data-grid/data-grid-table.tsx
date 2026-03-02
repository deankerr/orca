import * as React from 'react'
import { CSSProperties, Fragment, ReactNode, useCallback, useRef } from 'react'

import { Cell, Column, flexRender, Header, HeaderGroup, Row } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cva } from 'class-variance-authority'

import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import { useDataGrid } from './data-grid'

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

  return {
    left: isPinned === 'left' ? `${column.getStart('left')}px` : undefined,
    right: isPinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    position: isPinned ? 'sticky' : 'relative',
    width: column.getSize(),
    zIndex: isPinned ? 1 : 0,
  }
}

function DataGridTableBase({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()

  return (
    <table
      data-slot="data-grid-table"
      className={cn(
        'w-full caption-bottom text-left align-middle text-sm font-normal text-foreground rtl:text-right',
        !props.tableLayout?.columnsDraggable && 'border-separate border-spacing-0',
        props.tableLayout?.width === 'fixed' ? 'table-fixed' : 'table-auto',
        props.tableClassNames?.base,
      )}
    >
      {children}
    </table>
  )
}

function DataGridTableHead({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()

  return (
    <thead
      className={cn(
        props.tableClassNames?.header,
        props.tableLayout?.headerSticky && props.tableClassNames?.headerSticky,
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

  return (
    <tr
      key={headerGroup.id}
      data-slot="data-grid-table-head-row"
      className={cn(
        'bg-muted/40',
        props.tableLayout?.cellBorder && '*:last:border-e-0',
        props.tableLayout?.headerBackground === false && 'bg-transparent',
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
  const isLastLeftPinned = isPinned === 'left' && column.getIsLastColumn('left')
  const isFirstRightPinned = isPinned === 'right' && column.getIsFirstColumn('right')
  const headerCellSpacing = headerCellSpacingVariants({
    size: props.tableLayout?.dense ? 'dense' : 'default',
  })

  const pinningStyles =
    props.tableLayout?.columnsPinnable && column.getCanPin() ? getPinningStyles(column) : undefined
  const needsStickyTop = props.tableLayout?.headerSticky && pinningStyles?.position === 'sticky'

  return (
    <th
      key={header.id}
      ref={dndRef}
      style={{
        ...(props.tableLayout?.width === 'fixed' && {
          width: `${header.getSize()}px`,
        }),
        ...pinningStyles,
        ...(needsStickyTop && { top: 0, zIndex: 11 }),
        ...(dndStyle ? dndStyle : null),
      }}
      data-pinned={isPinned || undefined}
      data-last-col={isLastLeftPinned ? 'left' : isFirstRightPinned ? 'right' : undefined}
      data-slot="data-grid-table-head-row-cell"
      className={cn(
        'h-12 align-middle text-xs font-normal text-accent-foreground rtl:text-right [&:has([role=checkbox])]:pe-0',
        headerCellSpacing,
        props.tableLayout?.cellBorder && 'border-e',
        props.tableLayout?.columnsResizable && column.getCanResize() && 'truncate',
        props.tableLayout?.columnsPinnable &&
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
      {props.tableLayout?.headerBorder && (
        <div className="absolute bottom-0 left-0 h-px w-full bg-border" />
      )}
    </th>
  )
}

function DataGridTableHeadRowCellResize<TData>({ header }: { header: Header<TData, unknown> }) {
  const { column } = header

  return (
    <div
      {...{
        onDoubleClick: () => column.resetSize(),
        onMouseDown: header.getResizeHandler(),
        onTouchStart: header.getResizeHandler(),
        className:
          'absolute top-0 h-full w-4 cursor-col-resize user-select-none touch-none -end-2 z-10 flex justify-center before:absolute before:w-px before:inset-y-0 before:bg-border translate-x-px',
      }}
    />
  )
}

function DataGridTableRowSpacer() {
  return <tbody aria-hidden="true" className="h-2"></tbody>
}

function DataGridTableBody({ children }: { children: ReactNode }) {
  const { props } = useDataGrid()

  return (
    <tbody
      className={cn(
        props.tableLayout?.rowRounded &&
          '[&_td:first-child]:rounded-s-lg [&_td:last-child]:rounded-e-lg',
        props.tableClassNames?.body,
      )}
    >
      {children}
    </tbody>
  )
}

function DataGridTableBodyRowSkeleton({ children }: { children: ReactNode }) {
  const { table, props } = useDataGrid()

  return (
    <tr
      className={cn(
        'data-[state=selected]:bg-muted/50',
        props.onRowClick && 'cursor-pointer',
        props.tableLayout?.rowBorder && '[&>td]:border-b [&>td]:border-border',
        props.tableLayout?.cellBorder && '*:last:border-e-0',
        table.options.enableRowSelection && '*:first:relative',
        props.tableClassNames?.bodyRow,
      )}
    >
      {children}
    </tr>
  )
}

function DataGridTableBodyRowSkeletonCell<TData>({
  children,
  column,
}: {
  children: ReactNode
  column: Column<TData>
}) {
  const { props, table } = useDataGrid()
  const bodyCellSpacing = bodyCellSpacingVariants({
    size: props.tableLayout?.dense ? 'dense' : 'default',
  })

  return (
    <td
      className={cn(
        'align-middle',
        bodyCellSpacing,
        props.tableLayout?.cellBorder && 'border-e',
        props.tableLayout?.columnsResizable && column.getCanResize() && 'truncate',
        column.columnDef.meta?.cellClassName,
        column.getIndex() === 0 || column.getIndex() === table.getVisibleFlatColumns().length - 1
          ? props.tableClassNames?.edgeCell
          : '',
      )}
    >
      {children}
    </td>
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
  const { props, table } = useDataGrid()

  return (
    <tr
      ref={dndRef}
      style={dndStyle ?? undefined}
      data-state={table.options.enableRowSelection && row.getIsSelected() ? 'selected' : undefined}
      onClick={() => props.onRowClick && props.onRowClick(row.original)}
      className={cn(
        'group data-[state=selected]:bg-muted/50',
        props.onRowClick && 'cursor-pointer',
        props.tableLayout?.rowBorder && '[&>td]:border-b [&>td]:border-border',
        props.tableLayout?.cellBorder && '*:last:border-e-0',
        table.options.enableRowSelection && '*:first:relative',
        props.tableClassNames?.bodyRow,
      )}
    >
      {children}
    </tr>
  )
}

function DataGridTableBodyRowExpanded<TData>({ row }: { row: Row<TData> }) {
  const { props, table } = useDataGrid()

  return (
    <tr className={cn(props.tableLayout?.rowBorder && '[&>td]:border-b [&>td]:border-border')}>
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
  const isLastLeftPinned = isPinned === 'left' && column.getIsLastColumn('left')
  const isFirstRightPinned = isPinned === 'right' && column.getIsFirstColumn('right')
  const bodyCellSpacing = bodyCellSpacingVariants({
    size: props.tableLayout?.dense ? 'dense' : 'default',
  })

  return (
    <td
      key={cell.id}
      ref={dndRef}
      {...(props.tableLayout?.columnsDraggable && !isPinned ? { cell } : {})}
      style={{
        ...(props.tableLayout?.columnsPinnable && column.getCanPin() && getPinningStyles(column)),
        ...(dndStyle ? dndStyle : null),
      }}
      data-pinned={isPinned || undefined}
      data-last-col={isLastLeftPinned ? 'left' : isFirstRightPinned ? 'right' : undefined}
      className={cn(
        'align-middle',
        bodyCellSpacing,
        props.tableLayout?.cellBorder && 'border-e',
        props.tableLayout?.columnsResizable && column.getCanResize() && 'truncate',
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
      <td colSpan={totalColumns} className="h-32">
        <div className="sticky right-0 left-0 flex w-screen max-w-full items-center justify-center text-muted-foreground">
          {props.emptyMessage || 'No data available'}
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
        onCheckedChange={(value) => row.toggleSelected(!!value)}
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
      checked={
        table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
      }
      disabled={isLoading || recordCount === 0}
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
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

  const rowCount = isLoading ? (props.skeletonRows ?? 10) : table.getRowModel().rows.length

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: useCallback(
      (index: number) => {
        if (isLoading) return `skeleton-${index}`
        return table.getRowModel().rows[index]?.id ?? index
      },
      [isLoading, table],
    ),
  })

  const virtualRows = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0

  return (
    <ScrollArea
      viewportRef={scrollElementRef}
      className="flex-1"
      viewportClassName="flex overscroll-none"
      maskHeight={0}
    >
      <DataGridTableBase>
        <DataGridTableHead>
          {table.getHeaderGroups().map((headerGroup: HeaderGroup<TData>) => {
            return (
              <DataGridTableHeadRow headerGroup={headerGroup} key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const { column } = header

                  return (
                    <DataGridTableHeadRowCell header={header} key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {props.tableLayout?.columnsResizable && column.getCanResize() && (
                        <DataGridTableHeadRowCellResize header={header} />
                      )}
                    </DataGridTableHeadRowCell>
                  )
                })}
              </DataGridTableHeadRow>
            )
          })}
        </DataGridTableHead>

        {!props.tableLayout?.rowBorder && <DataGridTableRowSpacer />}

        <DataGridTableBody>
          {paddingTop > 0 && (
            <tr>
              <td style={{ height: `${paddingTop}px` }} />
            </tr>
          )}

          {isLoading ? (
            virtualRows.map((virtualRow) => (
              <DataGridTableBodyRowSkeleton key={virtualRow.key}>
                {table.getVisibleFlatColumns().map((column) => {
                  return (
                    <DataGridTableBodyRowSkeletonCell column={column} key={column.id}>
                      {column.columnDef.meta?.skeleton}
                    </DataGridTableBodyRowSkeletonCell>
                  )
                })}
              </DataGridTableBodyRowSkeleton>
            ))
          ) : virtualRows.length > 0 ? (
            virtualRows.map((virtualRow) => {
              const row = table.getRowModel().rows[virtualRow.index]
              if (!row) return null

              return (
                <Fragment key={virtualRow.key}>
                  <DataGridTableBodyRow row={row}>
                    {row.getVisibleCells().map((cell: Cell<TData, unknown>) => {
                      return (
                        <DataGridTableBodyRowCell cell={cell} key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </DataGridTableBodyRowCell>
                      )
                    })}
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
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

export {
  DataGridTableVirtual,
  DataGridTableBase,
  DataGridTableBody,
  DataGridTableBodyRow,
  DataGridTableBodyRowCell,
  DataGridTableBodyRowExpanded,
  DataGridTableBodyRowSkeleton,
  DataGridTableBodyRowSkeletonCell,
  DataGridTableEmpty,
  DataGridTableHead,
  DataGridTableHeadRow,
  DataGridTableHeadRowCell,
  DataGridTableHeadRowCellResize,
  DataGridTableRowSelect,
  DataGridTableRowSelectAll,
  DataGridTableRowSpacer,
}
