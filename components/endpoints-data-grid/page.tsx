'use client'

import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import { useIsMobile } from '@/hooks/use-mobile'

import { DataGrid } from '../data-grid/data-grid'
import {
  DataGridCard,
  DataGridCardContent,
  DataGridCardFooter,
  DataGridCardToolbar,
} from '../data-grid/data-grid-card'
import { fuzzyFilter } from '../data-grid/data-grid-fuzzy'
import { DataGridTableVirtual } from '../data-grid/data-grid-table'
import { AttributePopoverProvider } from '../shared/attribute-badge'
import { useEndpointsData } from './api'
import { columns } from './columns'
import { DataGridControls } from './controls'
import { DataGridFooter } from './footer'
import { useEndpointFilters } from './use-endpoint-filters'

export function EndpointsDataGrid() {
  const { filteredEndpoints, isLoading } = useEndpointsData()
  const { globalFilter, sorting, onSortingChange } = useEndpointFilters()
  const isMobile = useIsMobile()

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
      columnPinning: isMobile === false ? { left: ['model', 'provider'] } : {},
    },
    columnResizeMode: 'onChange',
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row._id,
    manualPagination: true,
  })

  return (
    <AttributePopoverProvider>
      <DataGrid
        table={table}
        recordCount={table.getFilteredRowModel().rows.length}
        isLoading={isLoading}
        emptyMessage="No endpoints found"
        skeletonRows={30}
        tableLayout={{
          headerSticky: true,
          headerBorder: true,
          width: 'fixed',
          cellBorder: true,
          rowHeight: 57,
          overscan: 20,
          columnsResizable: true,
          columnsPinnable: true,
        }}
        tableClassNames={{
          headerRow: 'uppercase font-mono',
          bodyRow:
            'has-aria-[label=disabled]:[&_td_>_*]:opacity-50 has-aria-[label=disabled]:[&_td]:text-foreground/50 has-aria-[label=gone]:[&_td_>_*]:opacity-50 has-aria-[label=gone]:[&_td]:text-foreground/50',
          body: 'font-mono',
        }}
      >
        <DataGridCard>
          <DataGridCardToolbar>
            <DataGridControls />
          </DataGridCardToolbar>

          <DataGridCardContent>
            <DataGridTableVirtual />
          </DataGridCardContent>

          <DataGridCardFooter>
            <DataGridFooter />
          </DataGridCardFooter>
        </DataGridCard>
      </DataGrid>
    </AttributePopoverProvider>
  )
}
