import { CSSProperties, Fragment, useCallback, useId, useRef } from 'react'

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToParentElement } from '@dnd-kit/modifiers'
import { horizontalListSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Cell, flexRender, Header, HeaderGroup, Row } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { GripVertical } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'

import { useDataGrid } from './data-grid'
import {
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
  DataGridTableRowSpacer,
} from './data-grid-table'

function DataGridTableDndHeader<TData>({ header }: { header: Header<TData, unknown> }) {
  const { props } = useDataGrid()
  const { column } = header

  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: header.column.id,
  })

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: 'relative',
    transform: CSS.Translate.toString(transform),
    transition,
    whiteSpace: 'nowrap',
    width: header.column.getSize(),
    zIndex: isDragging ? 1 : 0,
  }

  return (
    <DataGridTableHeadRowCell header={header} dndStyle={style} dndRef={setNodeRef}>
      <div
        data-slot="data-grid-table-dnd-handle-container"
        className="flex h-full items-center gap-0.5"
      >
        <Button
          size="icon"
          variant="ghost"
          className="-ms-2 size-6"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="opacity-50" aria-hidden="true" />
        </Button>
        {header.isPlaceholder
          ? null
          : flexRender(header.column.columnDef.header, header.getContext())}
        {props.tableLayout?.columnsResizable && column.getCanResize() && (
          <DataGridTableHeadRowCellResize header={header} />
        )}
      </div>
    </DataGridTableHeadRowCell>
  )
}

function DataGridTableDndCell<TData>({ cell }: { cell: Cell<TData, unknown> }) {
  const { isDragging, setNodeRef, transform, transition } = useSortable({
    id: cell.column.id,
  })

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: 'relative',
    transform: CSS.Translate.toString(transform),
    transition,
    width: cell.column.getSize(),
    zIndex: isDragging ? 1 : 0,
  }

  return (
    <DataGridTableBodyRowCell cell={cell} dndStyle={style} dndRef={setNodeRef}>
      {flexRender(cell.column.columnDef.cell, cell.getContext())}
    </DataGridTableBodyRowCell>
  )
}

function DataGridTableDnd<TData>({
  handleDragEnd,
}: {
  handleDragEnd: (event: DragEndEvent) => void
}) {
  const { table, isLoading, props } = useDataGrid()
  const pagination = table.getState().pagination

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  )

  return (
    <DndContext
      id={useId()}
      collisionDetection={closestCenter}
      modifiers={[restrictToParentElement]}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <div className="relative">
        <DataGridTableBase>
          <DataGridTableHead>
            {table.getHeaderGroups().map((headerGroup: HeaderGroup<TData>, index) => {
              return (
                <DataGridTableHeadRow headerGroup={headerGroup} key={index}>
                  <SortableContext
                    items={table.getState().columnOrder}
                    strategy={horizontalListSortingStrategy}
                  >
                    {headerGroup.headers.map((header, index) => (
                      <DataGridTableDndHeader header={header} key={index} />
                    ))}
                  </SortableContext>
                </DataGridTableHeadRow>
              )
            })}
          </DataGridTableHead>

          {(props.tableLayout?.stripped || !props.tableLayout?.rowBorder) && (
            <DataGridTableRowSpacer />
          )}

          <DataGridTableBody>
            {props.loadingMode === 'skeleton' && isLoading && pagination?.pageSize ? (
              Array.from({ length: pagination.pageSize }).map((_, rowIndex) => (
                <DataGridTableBodyRowSkeleton key={rowIndex}>
                  {table.getVisibleFlatColumns().map((column, colIndex) => {
                    return (
                      <DataGridTableBodyRowSkeletonCell column={column} key={colIndex}>
                        {column.columnDef.meta?.skeleton}
                      </DataGridTableBodyRowSkeletonCell>
                    )
                  })}
                </DataGridTableBodyRowSkeleton>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row: Row<TData>, index) => {
                return (
                  <Fragment key={row.id}>
                    <DataGridTableBodyRow row={row} key={index}>
                      {row.getVisibleCells().map((cell: Cell<TData, unknown>) => {
                        return (
                          <SortableContext
                            key={cell.id}
                            items={table.getState().columnOrder}
                            strategy={horizontalListSortingStrategy}
                          >
                            <DataGridTableDndCell cell={cell} />
                          </SortableContext>
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
          </DataGridTableBody>
        </DataGridTableBase>
      </div>
    </DndContext>
  )
}

function DataGridTableDndVirtual<TData>({
  handleDragEnd,
}: {
  handleDragEnd: (event: DragEndEvent) => void
}) {
  const { table, isLoading, props } = useDataGrid()
  const scrollElementRef = useRef<HTMLDivElement>(null)
  const pagination = table.getState().pagination
  const rowHeight = props.tableLayout?.rowHeight ?? 58.5
  const overscan = props.tableLayout?.overscan ?? 3

  const rowCount =
    isLoading && props.loadingMode === 'skeleton'
      ? props.skeletonRows || pagination?.pageSize || 10
      : table.getRowModel().rows.length

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => rowHeight,
    overscan,
    getItemKey: useCallback(
      (index: number) => {
        if (isLoading && props.loadingMode === 'skeleton') {
          return `skeleton-${index}`
        }
        return table.getRowModel().rows[index]?.id ?? index
      },
      [isLoading, props.loadingMode, table],
    ),
  })

  const virtualRows = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0 ? totalSize - virtualRows[virtualRows.length - 1].end : 0

  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  )

  return (
    <DndContext
      id={useId()}
      collisionDetection={closestCenter}
      modifiers={[restrictToParentElement]}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <ScrollArea
        viewportRef={scrollElementRef}
        className="flex-1"
        viewportClassName="flex overscroll-none"
        maskHeight={0}
      >
        <DataGridTableBase>
          <DataGridTableHead>
            {table.getHeaderGroups().map((headerGroup: HeaderGroup<TData>, index) => {
              return (
                <DataGridTableHeadRow headerGroup={headerGroup} key={index}>
                  <SortableContext
                    items={table.getState().columnOrder}
                    strategy={horizontalListSortingStrategy}
                  >
                    {headerGroup.headers.map((header, index) => (
                      <DataGridTableDndHeader header={header} key={index} />
                    ))}
                  </SortableContext>
                </DataGridTableHeadRow>
              )
            })}
          </DataGridTableHead>

          {(props.tableLayout?.stripped || !props.tableLayout?.rowBorder) && (
            <DataGridTableRowSpacer />
          )}

          <DataGridTableBody>
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: `${paddingTop}px` }} />
              </tr>
            )}

            {isLoading && props.loadingMode === 'skeleton' ? (
              virtualRows.map((virtualRow) => (
                <DataGridTableBodyRowSkeleton key={virtualRow.key}>
                  {table.getVisibleFlatColumns().map((column, colIndex) => {
                    return (
                      <DataGridTableBodyRowSkeletonCell column={column} key={colIndex}>
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
                      <SortableContext
                        items={table.getState().columnOrder}
                        strategy={horizontalListSortingStrategy}
                      >
                        {row.getVisibleCells().map((cell: Cell<TData, unknown>) => (
                          <DataGridTableDndCell cell={cell} key={cell.id} />
                        ))}
                      </SortableContext>
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
    </DndContext>
  )
}

export { DataGridTableDnd, DataGridTableDndVirtual }
