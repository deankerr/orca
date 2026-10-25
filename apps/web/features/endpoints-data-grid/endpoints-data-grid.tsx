'use client'

import { createSlugSearcher } from '@orca/contract/slug-search'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useMemo } from 'react'

import { useIsMobile } from '@/hooks/use-mobile'

import { attributes, isAttributeKey } from './attributes/attributes'
import type { FacetFilterState } from './attributes/facet-state'
import { useEndpointFacetState } from './attributes/use-endpoint-facet-state'
import { columns } from './columns'
import { DataGridControls } from './controls'
import { DataGrid } from './data-grid/data-grid'
import {
  DataGridCard,
  DataGridCardContent,
  DataGridCardFooter,
  DataGridCardToolbar,
} from './data-grid/data-grid-card'
import { DataGridTableVirtual } from './data-grid/data-grid-table'
import type { GridEndpoint } from './data/grid-endpoints'
import { EndpointsEmptyState } from './endpoints-empty-state'
import { DataGridFooter } from './footer'
import { DataGridPopoverProvider } from './popovers/popover-handle'
import { hasEndpointGridQuery } from './query-state'
import { useEndpointFocusState } from './use-endpoint-focus-state'
import { useEndpointQueryState } from './use-endpoint-query-state'
import { useEndpointSortState } from './use-endpoint-sort-state'

function filterEndpointsByFacets(
  endpoints: readonly GridEndpoint[],
  facetFilters: FacetFilterState,
) {
  return endpoints.filter((endpoint) => {
    for (const [filterName, mode] of Object.entries(facetFilters)) {
      if (!isAttributeKey(filterName)) {
        continue
      }

      const hasAttribute = attributes[filterName].resolve(endpoint).active

      if (mode === 'include' && !hasAttribute) {
        return false
      }

      if (mode === 'exclude' && hasAttribute) {
        return false
      }
    }

    return true
  })
}

function useEndpointGridRows({
  endpoints,
  facetFilters,
  query,
}: {
  endpoints: GridEndpoint[]
  facetFilters: FacetFilterState
  query: string
}) {
  const facetRows = useMemo(
    () => filterEndpointsByFacets(endpoints, facetFilters),
    [endpoints, facetFilters],
  )

  const endpointSearcher = useMemo(
    () =>
      createSlugSearcher(facetRows, {
        compareItems: (left, right) =>
          right.model_or_created_at.localeCompare(left.model_or_created_at) ||
          left.model_id.localeCompare(right.model_id) ||
          left.provider_tag.localeCompare(right.provider_tag),
        getFields: (endpoint) => [
          { name: 'model_id', value: endpoint.model_id },
          { name: 'provider_tag', value: endpoint.provider_tag },
        ],
      }),
    [facetRows],
  )

  const rows = useMemo(() => {
    if (!hasEndpointGridQuery(query)) {
      return facetRows
    }

    return endpointSearcher.search(query).map((result) => result.record)
  }, [endpointSearcher, facetRows, query])

  return {
    rows,
  }
}

export function EndpointsDataGrid({
  endpoints,
  isPending,
}: {
  endpoints: GridEndpoint[]
  isPending: boolean
}) {
  'use no memo'
  const query = useEndpointQueryState()
  const focus = useEndpointFocusState()
  const facets = useEndpointFacetState()
  const sort = useEndpointSortState({ hasActiveQuery: query.hasQuery })
  const { rows } = useEndpointGridRows({
    endpoints,
    facetFilters: facets.facetFilters,
    query: query.query,
  })
  const isMobile = useIsMobile()

  const rowDataAttributes = (row: GridEndpoint) => {
    let status: 'gone' | 'disabled' | undefined
    if (row.unlisted_at !== undefined && row.unlisted_at !== null) {
      status = 'gone'
    } else if (row.disabled === true) {
      status = 'disabled'
    }

    return {
      ...(status === undefined ? {} : { 'data-row-status': status }),
      ...(focus.highlightUuid && row.endpoint_id.startsWith(focus.highlightUuid)
        ? { 'data-highlighted': 'true' }
        : {}),
    }
  }

  // oxlint-disable-next-line react-hooks-js/incompatible-library
  const table = useReactTable({
    columnResizeMode: 'onChange',
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row._id,
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    onSortingChange: sort.onSortingChange,
    state: {
      columnPinning: isMobile === false ? { left: ['model', 'provider'] } : {},
      sorting: sort.sorting,
    },
  })

  return (
    <DataGridPopoverProvider>
      <DataGrid
        table={table}
        isLoading={isPending}
        emptyMessage={<EndpointsEmptyState />}
        rowDataAttributes={rowDataAttributes}
        tableLayout={{
          cellBorder: true,
          columnsPinnable: true,
          columnsResizable: true,
          headerSticky: true,
          rowHeight: 48,
        }}
        tableClassNames={{
          body: 'font-mono text-xs',
          bodyCell: 'px-2.5 py-1.5',
          bodyRow:
            '[&>td]:bg-background hover:[&>td]:bg-muted-hover data-[row-status]:[&_td_>_*]:opacity-50 data-[row-status]:[&_td]:text-foreground/50',
          headerCell: 'text-center',
          headerRow: 'uppercase font-mono',
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
            <DataGridFooter
              totalCount={endpoints.length}
              hasActiveFilters={query.hasQuery || facets.hasActiveFacets}
              isLoading={isPending}
            />
          </DataGridCardFooter>
        </DataGridCard>
      </DataGrid>
    </DataGridPopoverProvider>
  )
}
