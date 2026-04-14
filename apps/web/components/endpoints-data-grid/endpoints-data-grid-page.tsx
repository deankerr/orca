'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import type { EndpointProjection } from '@orca/backend/convex/catalog/endpoints'
import { useQuery } from '@tanstack/react-query'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import ms from 'ms'
import { useCallback, useMemo } from 'react'

import { useIsMobile } from '@/hooks/use-mobile'
import { attributes, isAttributeKey } from '@/lib/attributes'
import { createSlugSearcher } from '@/lib/slug-search'

import { DataGrid } from '../data-grid/data-grid'
import {
  DataGridCard,
  DataGridCardContent,
  DataGridCardFooter,
  DataGridCardToolbar,
} from '../data-grid/data-grid-card'
import { DataGridTableVirtual } from '../data-grid/data-grid-table'
import type { EndpointRow } from './columns'
import { columns } from './columns'
import { DataGridControls } from './controls'
import { EndpointsEmptyState } from './endpoints-empty-state'
import { DataGridFooter } from './footer'
import { DataGridPopoverProvider } from './popover-handle'
import type { FacetFilterState } from './use-endpoint-facet-state'
import { useEndpointFacetState } from './use-endpoint-facet-state'
import { useEndpointFocusState } from './use-endpoint-focus-state'
import { hasEndpointGridQuery, useEndpointQueryState } from './use-endpoint-query-state'
import { useEndpointSortState } from './use-endpoint-sort-state'

function useEndpointsList() {
  return useQuery(convexQuery(api.endpoints.list, { maxTimeUnavailable: ms('30d') }))
}

function filterEndpointsByFacets(
  endpoints: readonly EndpointProjection[],
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
  endpoints: readonly EndpointProjection[]
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
        getFields: (endpoint) => [
          { name: 'model.slug', value: endpoint.model.slug },
          { name: 'model.version_slug', value: endpoint.model.version_slug },
          { name: 'provider.tag_slug', value: endpoint.provider.tag_slug },
        ],
        compareItems: (left, right) =>
          right.model.or_added_at - left.model.or_added_at ||
          left.model.slug.localeCompare(right.model.slug) ||
          left.provider.tag_slug.localeCompare(right.provider.tag_slug),
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

export function EndpointsDataGrid() {
  'use no memo'
  const query = useEndpointQueryState()
  const focus = useEndpointFocusState()
  const facets = useEndpointFacetState()
  const sort = useEndpointSortState({ hasActiveQuery: query.hasQuery })
  const { data: rawEndpoints = [], isPending } = useEndpointsList()
  const { rows } = useEndpointGridRows({
    endpoints: rawEndpoints,
    facetFilters: facets.facetFilters,
    query: query.query,
  })
  const isMobile = useIsMobile()

  // Compute row-level data attributes for status-based styling
  const rowDataAttributes = useCallback((row: EndpointRow) => {
    let status: 'gone' | 'disabled' | undefined
    if (row.unavailable_at !== undefined && row.unavailable_at !== null) {
      status = 'gone'
    } else if (row.disabled) {
      status = 'disabled'
    }

    return status === undefined ? {} : { 'data-row-status': status }
  }, [])

  // Derive row selection from highlight UUID
  const rowSelection = useMemo(() => {
    if (!focus.highlightUuid) {
      return {}
    }
    const match = rows.find((endpoint) => endpoint.uuid.startsWith(focus.highlightUuid))
    return match ? { [match._id]: true } : {}
  }, [focus.highlightUuid, rows])

  // oxlint-disable-next-line react-hooks-js/incompatible-library
  const table = useReactTable({
    columns,
    data: rows,
    state: {
      sorting: sort.sorting,
      rowSelection,
      columnPinning: isMobile === false ? { left: ['uuid', 'model', 'provider'] } : {},
    },
    columnResizeMode: 'onChange',
    onSortingChange: sort.onSortingChange,
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
        isLoading={isPending}
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
            <DataGridFooter
              totalCount={rawEndpoints.length}
              hasActiveFilters={query.hasQuery || facets.hasActiveFacets}
              isLoading={isPending}
            />
          </DataGridCardFooter>
        </DataGridCard>
      </DataGrid>
    </DataGridPopoverProvider>
  )
}
