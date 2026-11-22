import type { Workload } from '@orca/pricing'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import { useDeferredValue, useMemo } from 'react'

import { propertyFacetGroups } from './facets'
import type { PropertyFacetGroup } from './facets'
import { applyFilters, facetCounts, rangeHistograms, scopeSummary } from './filtering'
import type { FacetCounts, Histogram, RangeFacet, ScopeSummary } from './filtering'
import {
  clearedFilters,
  propertyFilters,
  scopeFilters,
  scopeWorkload,
  workloadParams,
} from './scope'
import type { Scope, ScopeFilters } from './scope'
import { buildSnapshot, snapshotQuery } from './snapshot'
import type { EndpointRow, Snapshot } from './snapshot'
import { sortRows, sortWorkload } from './sort'
import type { SortKey } from './sort'

// PascalCase, so the React Compiler recognises `RouteApi.useX()` as a hook call.
const RouteApi = getRouteApi('/')

/** The snapshot's rows, built once per payload. The index route's loader has already fetched it. */
export function useSnapshot(): Snapshot {
  return useSuspenseQuery({ ...snapshotQuery, select: buildSnapshot }).data
}

// The single-param hooks below re-render a component only when that param changes, so the sort, the
// workload, the selection, and the plot toggle stay out of components that do not read them. The router keeps a
// param's value across navigations that leave it unchanged, so a list param is stable too.

/** The selected endpoint's id. */
export function useSelectedId(): string | undefined {
  return RouteApi.useSearch({ select: (scope) => scope.endpoint })
}

export function useSort(): SortKey {
  return RouteApi.useSearch({ select: (scope) => scope.sort })
}

/**
 * The workload the costs are computed under, from the `ratio` and `hit` params. The selector builds a
 * fresh object, so structural sharing hands back the previous one while both numbers are unchanged.
 */
export function useWorkload(): Workload {
  return RouteApi.useSearch({ select: scopeWorkload, structuralSharing: true })
}

/**
 * The workload the sort depends on: the current one when sorting by cost, else a constant, so changing
 * the workload neither re-renders nor re-sorts under any other sort.
 */
function useSortWorkload(): Workload {
  return RouteApi.useSearch({
    select: (scope) => sortWorkload(scope.sort, scopeWorkload(scope)),
    structuralSharing: true,
  })
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
 * filter, the sort, the reference time, or, when sorting by cost, the workload, so selecting an endpoint or toggling the plot leaves it
 * alone and nothing downstream filters, sorts, or re-renders.
 */
export function useScopedRows(): EndpointRow[] {
  const [{ at, rows }, filters] = useSnapshotAndFilters()
  const sort = useSort()
  const workload = useSortWorkload()

  return useMemo(
    () => sortRows(applyFilters(rows, filters, at), sort, workload),
    [at, rows, filters, sort, workload],
  )
}

/** Rows for a view that trails the URL, and whether it is still catching up to it. */
interface DeferredRows {
  rows: EndpointRow[]
  /** True while the URL has changed but the view still reflects the previous state: the filters, and for the Table the workload. */
  stale: boolean
}

/**
 * Rows matching every filter, in snapshot order, for a heavy view (the Table, the plot). The filters
 * are deferred, not the rows: a filter change renders the view once more with the old rows, which
 * its memoised children skip, and filters nothing; then the new rows render in an interruptible
 * pass that the next keystroke or click can abandon. Without this the router's store, which always
 * updates synchronously, would make the whole view render inside the click.
 */
export function useDeferredFilteredRows(): DeferredRows {
  const { at, rows } = useSnapshot()
  const filters = useScopeFilters()
  const deferred = useDeferredValue(filters)

  const matching = useMemo(() => applyFilters(rows, deferred, at), [at, rows, deferred])

  return { rows: matching, stale: filters !== deferred }
}

/** Rows for the Table, with the workload they are sorted under and the costs must be shown under. */
interface DeferredScopedRows extends DeferredRows {
  /**
   * The workload that trails the URL's, as the rows trail the filters. Sort by it, and compute every
   * cost from it, so the figures always agree with the order.
   */
  workload: Workload
}

/**
 * `useScopedRows` for the Table: the filters and the workload are deferred, but the sort is not. A
 * workload change re-renders the Table once with the old rows and the old workload, which its
 * memoised children skip; then the new ones render in an interruptible pass. Sorting is cheap
 * against rendering, and a header click should reorder the rows it already shows, not wait behind
 * them.
 *
 * The sort uses the deferred workload, never the URL's: the costs on screen are computed from the
 * returned `workload`, so a cost sort that moved ahead of them would show costs out of order. `stale`
 * covers either deferral, under any sort, since the costs lag under all of them.
 */
export function useDeferredScopedRows(): DeferredScopedRows {
  const { rows: matching, stale: filtersStale } = useDeferredFilteredRows()
  const sort = useSort()
  const current = useWorkload()
  const workload = useDeferredValue(current)
  const sortedUnder = sortWorkload(sort, workload)

  return {
    rows: useMemo(() => sortRows(matching, sort, sortedUnder), [matching, sort, sortedUnder]),
    stale: filtersStale || current !== workload,
    workload,
  }
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
    /** Changes the workload numbers it names and leaves the other as the current scope has it. */
    setWorkload: (change: Partial<Workload>) => {
      update(() => workloadParams(change), { replace: true })
    },
    togglePlot: () => {
      update(({ plot }) => ({ plot: !plot }), { replace: true })
    },
    update,
  }
}
