import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useMemo } from 'react'

import { propertyFacetGroups } from './facets'
import type { PropertyFacetGroup } from './facets'
import { applyFilters, facetCounts, rangeHistograms, scopeSummary } from './filtering'
import type { FacetCounts, Histogram, RangeFacet, ScopeSummary } from './filtering'
import { clearedFilters, propertyFilters, scopeFilters } from './scope'
import type { Scope, ScopeFilters } from './scope'
import { buildSnapshot, snapshotQuery } from './snapshot'
import type { EndpointRow, Snapshot } from './snapshot'
import { sortRows } from './sort'
import type { SortKey } from './sort'

// PascalCase, so the React Compiler recognises `RouteApi.useX()` as a hook call.
const RouteApi = getRouteApi('/')

/** The snapshot's rows, built once per payload. The index route's loader has already fetched it. */
export function useSnapshot(): Snapshot {
  return useSuspenseQuery({ ...snapshotQuery, select: buildSnapshot }).data
}

// The single-param hooks below re-render a component only when that param changes, so the sort, the
// selection, and the plot toggle stay out of components that do not read them. The router keeps a
// param's value across navigations that leave it unchanged, so a list param is stable too.

/** The selected endpoint's id. */
export function useSelectedId(): string | undefined {
  return RouteApi.useSearch({ select: (scope) => scope.endpoint })
}

export function useSort(): SortKey {
  return RouteApi.useSearch({ select: (scope) => scope.sort })
}

/** Whether the plot is shown. */
export function usePlot(): boolean {
  return RouteApi.useSearch({ select: (scope) => scope.plot })
}

/** Whether unlisted endpoints are shown. */
export function useUnlisted(): boolean {
  return RouteApi.useSearch({ select: (scope) => scope.unlisted })
}

export function useReleased(): ScopeFilters['released'] {
  return RouteApi.useSearch({ select: (scope) => scope.released })
}

/** A numeric bound's value, or undefined when unbounded. */
export function useBound(facet: 'maxInput' | 'minContext' | 'minTps'): number | undefined {
  return RouteApi.useSearch({ select: (scope) => scope[facet] })
}

/**
 * The scope's filters, which narrow or widen the rows. They ignore the sort, plot, and selection.
 * The selector builds a fresh object, so structural sharing hands back the previous one while every
 * filter is deeply equal: components re-render, and memos recompute, only when a filter changes.
 */
export function useScopeFilters(): ScopeFilters {
  return RouteApi.useSearch({ select: scopeFilters, structuralSharing: true })
}

/** The scope's `with` and `without` lists, shared like `useScopeFilters`. */
export function usePropertyFilters(): Pick<ScopeFilters, 'with' | 'without'> {
  return RouteApi.useSearch({ select: propertyFilters, structuralSharing: true })
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
  const sort = useSort()

  return useMemo(() => sortRows(applyFilters(rows, filters, at), sort), [at, rows, filters, sort])
}

/**
 * Per-value counts for every facet. Each kind's map keeps its identity while its contents stay equal,
 * and every caller with the same snapshot and filters shares one computation (see `facetCounts`).
 */
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
  const endpoint = useSelectedId()

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
  const navigate = RouteApi.useNavigate()

  const update = (change: ScopeUpdate, options?: ScopeUpdateOptions) => {
    navigate({
      replace: options?.replace ?? false,
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
