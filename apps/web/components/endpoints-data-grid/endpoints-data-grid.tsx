'use client'

import type { EndpointProjection } from '@orca/backend/convex/catalog/endpoints'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useMemo } from 'react'

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

type EndpointProjectionLike = Omit<EndpointProjection, '_id'> & { _id: string }

function filterEndpointsByFacets(
  endpoints: readonly EndpointProjectionLike[],
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
  endpoints: EndpointProjectionLike[]
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

// oxlint-disable-next-line react/react-compiler
export function EndpointsDataGrid({
  endpoints,
  isPending,
}: {
  endpoints: EndpointProjectionLike[]
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

  const rowDataAttributes = (row: EndpointRow) => {
    let status: 'gone' | 'disabled' | undefined
    if (row.unavailable_at !== undefined && row.unavailable_at !== null) {
      status = 'gone'
    } else if (row.disabled) {
      status = 'disabled'
    }

    return {
      ...(status === undefined ? {} : { 'data-row-status': status }),
      ...(focus.highlightUuid && row.uuid.startsWith(focus.highlightUuid)
        ? { 'data-highlighted': 'true' }
        : {}),
    }
  }

  // oxlint-disable-next-line react-hooks-js/incompatible-library
  const table = useReactTable({
    columns,
    data: rows,
    state: {
      sorting: sort.sorting,
      columnPinning: isMobile === false ? { left: ['uuid', 'model', 'provider'] } : {},
    },
    columnResizeMode: 'onChange',
    onSortingChange: sort.onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row._id,
    manualPagination: true,
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
          cellBorder: true,
          rowHeight: 48,
          columnsResizable: true,
          columnsPinnable: true,
        }}
        tableClassNames={{
          headerRow: 'uppercase font-mono',
          headerCell: 'text-center',
          bodyRow:
            '[&>td]:bg-background hover:[&>td]:bg-muted-hover data-[row-status]:[&_td_>_*]:opacity-50 data-[row-status]:[&_td]:text-foreground/50',
          bodyCell: 'px-2.5 py-1.5',
          body: 'font-mono text-xs',
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
