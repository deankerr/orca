import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'

import { propertyFacetGroups } from './facets'
import type { PropertyFacetGroup } from './facets'
import { applyFilters, facetCounts, rangeHistograms, scopeSummary } from './filtering'
import type { FacetCounts, Histogram, RangeFacet, ScopeSummary } from './filtering'
import { clearedFilters } from './scope'
import type { Scope, ScopeFilters } from './scope'
import { buildSnapshot, snapshotQuery } from './snapshot'
import type { EndpointRow, Snapshot } from './snapshot'
import { sortRows } from './sort'
import type { SortKey } from './sort'

const routeApi = getRouteApi('/')

/** The snapshot's rows, built once per payload. The index route's loader has already fetched it. */
export function useSnapshot(): Snapshot {
  return useSuspenseQuery({ ...snapshotQuery, select: buildSnapshot }).data
}

/** The index route's validated scope: filters, sort, plot, and selection, defaults included. */
export function useScope(): Scope {
  return routeApi.useSearch()
}

/**
 * The scope's filters, which narrow or widen the rows. The router hands out a new scope object for
 * every change, selection and plot included, but keeps each unchanged param's value, so this object
 * changes only when a filter does.
 */
function useScopeFilters(): ScopeFilters {
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
  } = useScope()

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

function useSnapshotAndFilters(): [Snapshot, ScopeFilters] {
  return [useSnapshot(), useScopeFilters()]
}

/**
 * Rows matching every filter, in the URL's sort order. The array changes only with the snapshot, a
 * filter, the sort, or the reference time, so selecting an endpoint or toggling the plot leaves it
 * alone and nothing downstream filters, sorts, or re-renders.
 */
export function useScopedRows(): EndpointRow[] {
  const [{ at, rows }, filters] = useSnapshotAndFilters()
  const { sort } = useScope()

  return useMemo(() => sortRows(applyFilters(rows, filters, at), sort), [at, rows, filters, sort])
}

export function useFacetCounts(): FacetCounts {
  const [{ at, rows }, filters] = useSnapshotAndFilters()

  return useMemo(() => facetCounts(rows, filters, at), [at, rows, filters])
}

export function useRangeHistograms(): Record<RangeFacet, Histogram> {
  const [{ at, rows }, filters] = useSnapshotAndFilters()

  return useMemo(() => rangeHistograms(rows, filters, at), [at, rows, filters])
}

export function useScopeSummary(): ScopeSummary {
  const [{ at, rows }, filters] = useSnapshotAndFilters()

  return useMemo(() => scopeSummary(rows, filters, at), [at, rows, filters])
}

/** Property facets offered for this snapshot, grouped in snapshot order. */
export function usePropertyFacetGroups(): PropertyFacetGroup[] {
  const { rows } = useSnapshot()

  return useMemo(() => propertyFacetGroups(rows), [rows])
}

/** The selected endpoint's row, whether or not the filters keep it in scope. */
export function useSelectedEndpoint(): EndpointRow | null {
  const { byId } = useSnapshot()
  const { endpoint } = useScope()

  return endpoint === undefined ? null : (byId.get(endpoint) ?? null)
}

export interface ScopeUpdateOptions {
  /** Replace the history entry: for typing and view state. Discrete filter changes push. */
  replace?: boolean
}

/** Changes to the scope, from the current one. */
type ScopeUpdate = (scope: Scope) => Partial<Scope>

/**
 * Scope updates. `update` merges the changes it derives from the current scope and pushes a
 * history entry unless told to replace; the named actions apply the policy for their kind of change.
 */
export function useScopeActions() {
  const navigate = routeApi.useNavigate()

  const update = (change: ScopeUpdate, { replace = false }: ScopeUpdateOptions = {}) => {
    navigate({
      replace,
      resetScroll: false,
      search: (scope) => ({ ...scope, ...change(scope) }),
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
