'use client'

import { useState } from 'react'

import { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import { DataGrid } from '../data-grid/data-grid'
import {
  DataGridCard,
  DataGridCardContent,
  DataGridCardFooter,
  DataGridCardToolbar,
} from '../data-grid/data-grid-card'
import { fuzzyFilter } from '../data-grid/data-grid-fuzzy'
import { DataGridTableDndVirtual } from '../data-grid/data-grid-table-dnd'
import { useEndpointsData } from './api'
import { columns } from './columns'
import { DataGridControls } from './controls'
import { DataGridFooter } from './footer'
import { useEndpointFilters } from './use-endpoint-filters'

export function EndpointsDataGrid() {
  const { filteredEndpoints, isLoading } = useEndpointsData()
  const { globalFilter, sorting, onSortingChange } = useEndpointFilters()

  const [columnOrder, setColumnOrder] = useState<string[]>(
    columns.map((column) => column.id as string),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (active && over && active.id !== over.id) {
      setColumnOrder((columnOrder) => {
        const oldIndex = columnOrder.indexOf(active.id as string)
        const newIndex = columnOrder.indexOf(over.id as string)
        return arrayMove(columnOrder, oldIndex, newIndex)
      })
    }
  }

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columns,
    data: filteredEndpoints,
    filterFns: {
      fuzzy: fuzzyFilter,
    },
    globalFilterFn: 'fuzzy',
    state: {
      globalFilter,
      sorting,
      columnOrder,
    },
    columnResizeMode: 'onChange',
    onSortingChange,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row._id,
    manualPagination: true,
  })

  return (
    <DataGrid
      table={table}
      recordCount={table.getFilteredRowModel().rows.length}
      isLoading={isLoading}
      loadingMessage="Loading endpoints..."
      emptyMessage="No endpoints found"
      skeletonRows={30}
      tableLayout={{
        headerSticky: true,
        headerBorder: true,
        width: 'fixed',
        cellBorder: true,
        virtualized: true,
        rowHeight: 57,
        overscan: 20,
        columnsDraggable: true,
        columnsResizable: true,
      }}
      tableClassNames={{
        headerRow: 'uppercase font-mono',
        bodyRow:
          'has-aria-[label=disabled]:[&_td_>_*]:opacity-50 has-aria-[label=disabled]:[&_td]:text-foreground/50 has-aria-[label=gone]:[&_td_>_*]:opacity-50 has-aria-[label=gone]:[&_td]:text-foreground/50',
        body: 'font-mono',
        base: 'border-x border-b',
      }}
    >
      <DataGridCard>
        <DataGridCardToolbar>
          <DataGridControls />
        </DataGridCardToolbar>

        <DataGridCardContent>
          <DataGridTableDndVirtual handleDragEnd={handleDragEnd} />
        </DataGridCardContent>

        <DataGridCardFooter>
          <DataGridFooter />
        </DataGridCardFooter>
      </DataGridCard>
    </DataGrid>
  )
}
