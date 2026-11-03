import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'

import { propertyFacetGroups } from './facets'
import type { PropertyFacetGroup } from './facets'
import { applyFilters, facetCounts, rangeHistograms, scopeSummary } from './filters'
import type { FacetCounts, Histogram, RangeFacet, ScopeSummary } from './filters'
import { snapshotQuery } from './query'
import { buildCatalog } from './rows'
import type { Catalog, EndpointRow } from './rows'
import { clearedFilters } from './search'
import type { EndpointFilters, EndpointSearch, SortKey } from './search'
import { sortRows } from './sort'

const routeApi = getRouteApi('/')

/** Catalogue rows, built once per snapshot. The index route's loader has already fetched it. */
export function useCatalog(): Catalog {
  return useSuspenseQuery({ ...snapshotQuery, select: buildCatalog }).data
}

/** The index route's validated search params, defaults included. */
export function useEndpointSearch(): EndpointSearch {
  return routeApi.useSearch()
}

/**
 * The search params that narrow or widen the rows. The router hands out a new search object for every
 * change, selection and plot included, but keeps each unchanged param's value, so this object changes
 * only when a filter does.
 */
function useFilterParams(): EndpointFilters {
  const {
    maxInput,
    minContext,
    minTps,
    model,
    provider,
    released,
    unlisted,
    with: withProperties,
    without,
  } = useEndpointSearch()

  return useMemo(
    () => ({
      maxInput,
      minContext,
      minTps,
      model,
      provider,
      released,
      unlisted,
      with: withProperties,
      without,
    }),
    [maxInput, minContext, minTps, model, provider, released, unlisted, withProperties, without],
  )
}

function useFilters(): [Catalog, EndpointFilters] {
  return [useCatalog(), useFilterParams()]
}

/**
 * Rows matching every filter, in the URL's sort order. The array changes only with the catalogue, a
 * filter, the sort, or the reference time, so selecting an endpoint or toggling the plot leaves it
 * alone and nothing downstream filters, sorts, or re-renders.
 */
export function useFilteredRows(): EndpointRow[] {
  const [{ at, rows }, filters] = useFilters()
  const { sort } = useEndpointSearch()

  return useMemo(() => sortRows(applyFilters(rows, filters, at), sort), [at, rows, filters, sort])
}

export function useFacetCounts(): FacetCounts {
  const [{ at, rows }, filters] = useFilters()

  return useMemo(() => facetCounts(rows, filters, at), [at, rows, filters])
}

export function useRangeHistograms(): Record<RangeFacet, Histogram> {
  const [{ at, rows }, filters] = useFilters()

  return useMemo(() => rangeHistograms(rows, filters, at), [at, rows, filters])
}

export function useScopeSummary(): ScopeSummary {
  const [{ at, rows }, filters] = useFilters()

  return useMemo(() => scopeSummary(rows, filters, at), [at, rows, filters])
}

/** Property facets offered for this catalogue, grouped in catalogue order. */
export function usePropertyFacetGroups(): PropertyFacetGroup[] {
  const { rows } = useCatalog()

  return useMemo(() => propertyFacetGroups(rows), [rows])
}

/** The selected endpoint's row, whether or not the filters keep it in scope. */
export function useSelectedEndpoint(): EndpointRow | null {
  const { byId } = useCatalog()
  const { endpoint } = useEndpointSearch()

  return endpoint === undefined ? null : (byId.get(endpoint) ?? null)
}

export interface SearchUpdateOptions {
  /** Replace the history entry: for typing, dragging, and view state. Discrete filter changes push. */
  replace?: boolean
}

/** Changes to search params, from the current ones. */
type SearchUpdate = (search: EndpointSearch) => Partial<EndpointSearch>

/**
 * Search param updates. `update` merges the changes it derives from the current search and pushes a
 * history entry unless told to replace; the named actions apply the policy for their kind of change.
 */
export function useEndpointSearchActions() {
  const navigate = routeApi.useNavigate()

  const update = (change: SearchUpdate, { replace = false }: SearchUpdateOptions = {}) => {
    navigate({
      replace,
      resetScroll: false,
      search: (search) => ({ ...search, ...change(search) }),
    }).catch(reportError)
  }

  return {
    clearFilters: () => {
      update(() => clearedFilters)
    },
    selectEndpoint: (id: string | undefined) => {
      update(() => ({ endpoint: id }), { replace: true })
    },
    setSort: (sort: SortKey) => {
      update(() => ({ sort }), { replace: true })
    },
    togglePlot: () => {
      update(({ plot }) => ({ plot: !plot }), { replace: true })
    },
    update,
  }
}
