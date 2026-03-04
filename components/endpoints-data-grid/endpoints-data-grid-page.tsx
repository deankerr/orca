'use client'

import { useCallback, useMemo } from 'react'

import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { SearchXIcon } from 'lucide-react'

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
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
import { Button } from '../ui/button'
import { useEndpointsData } from './api'
import { columns, EndpointRow } from './columns'
import { DataGridControls } from './controls'
import { DataGridFooter } from './footer'
import { DataGridPopoverProvider } from './popover-handle'
import { useEndpointFilters } from './use-endpoint-filters'

function EndpointsEmptyState() {
  const {
    globalFilter,
    clearAllFilters,
    setGlobalFilter,
    activeAttributeCount,
    activeModalityCount,
  } = useEndpointFilters()

  const filterCount = activeAttributeCount + activeModalityCount
  const hasSearch = !!globalFilter

  const clearEverything = () => {
    clearAllFilters()
    setGlobalFilter('')
  }

  return (
    <Empty className="border-none">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchXIcon />
        </EmptyMedia>
        {hasSearch ? (
          <>
            <EmptyTitle>No results for &ldquo;{globalFilter}&rdquo;</EmptyTitle>
            <EmptyDescription>
              {filterCount > 0
                ? `${filterCount} active filter${filterCount > 1 ? 's' : ''} may be narrowing results`
                : 'Check your spelling or try a broader search'}
            </EmptyDescription>
          </>
        ) : (
          <>
            <EmptyTitle>No endpoints match your filters</EmptyTitle>
            <EmptyDescription>
              {filterCount} active filter{filterCount > 1 ? 's' : ''} returned no results
            </EmptyDescription>
          </>
        )}
      </EmptyHeader>
      <EmptyContent>
        <Button variant="secondary" size="sm" onClick={clearEverything}>
          Reset
        </Button>
      </EmptyContent>
    </Empty>
  )
}

export function EndpointsDataGrid() {
  'use no memo'
  const { filteredEndpoints, isLoading } = useEndpointsData()
  const { globalFilter, highlightUuid, sorting, onSortingChange } = useEndpointFilters()
  const isMobile = useIsMobile()

  // Compute row-level data attributes for status-based styling
  const rowDataAttributes = useCallback((row: EndpointRow) => {
    const status = row.unavailable_at ? 'gone' : row.disabled ? 'disabled' : undefined
    return status ? { 'data-row-status': status } : {}
  }, [])

  // Derive row selection from highlight UUID
  const rowSelection = useMemo(() => {
    if (!highlightUuid) return {}
    const match = filteredEndpoints.find((e) => e.uuid.startsWith(highlightUuid))
    return match ? { [match._id]: true } : {}
  }, [highlightUuid, filteredEndpoints])

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
      rowSelection,
      columnPinning: isMobile === false ? { left: ['uuid', 'model', 'provider'] } : {},
    },
    columnResizeMode: 'onChange',
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row._id,
    manualPagination: true,
    enableRowSelection: true,
  })

  return (
    <DataGridPopoverProvider>
      <DataGrid
        table={table}
        recordCount={table.getFilteredRowModel().rows.length}
        isLoading={isLoading}
        emptyMessage={<EndpointsEmptyState />}
        rowDataAttributes={rowDataAttributes}
        tableLayout={{
          headerSticky: true,
          headerBorder: true,
          width: 'fixed',
          cellBorder: true,
          rowHeight: 57,
          overscan: 10,
          columnsResizable: true,
          columnsPinnable: true,
        }}
        tableClassNames={{
          headerRow: 'uppercase font-mono',
          bodyRow:
            '[&>td]:bg-background hover:[&>td]:bg-muted-hover data-[row-status]:[&_td_>_*]:opacity-50 data-[row-status]:[&_td]:text-foreground/50',
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
    </DataGridPopoverProvider>
  )
}
