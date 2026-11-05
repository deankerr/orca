import { properties } from '@orca/properties'
import type { PropertyId } from '@orca/properties'
import { subMonths } from 'date-fns'
import * as R from 'remeda'

import type { ScopeFilters } from './scope'
import type { EndpointRow } from './snapshot'

/**
 * Filter semantics:
 * - The universe is listed endpoints, plus unlisted ones when `unlisted` is set.
 * - Values within a list facet (model, provider) combine with OR; facets combine with AND.
 * - Each property is its own facet: `with` requires it active, `without` requires it inactive.
 * - Range bounds are inclusive. A row whose value is absent fails any bound on it. A free endpoint's
 *   input rate is 0, not absent, so it passes any maximum input price.
 * - Release windows count back calendar months from the reference time.
 */

/** Release windows in months before the reference time. */
export const RELEASE_WINDOWS = [1, 3, 6, 12] as const

export type ReleaseWindow = (typeof RELEASE_WINDOWS)[number]

/** A range facet's bound and the row value it applies to. */
export type RangeFacet = 'maxInput' | 'minContext' | 'minTps' | 'released'

type Facet = 'model' | 'provider' | RangeFacet | `property:${PropertyId}`

interface Constraint {
  facet: Facet
  test: (row: EndpointRow) => boolean
}

const propertyFacet = (id: PropertyId): Facet => `property:${id}`

const releaseCutoff = (at: string, months: number) => subMonths(new Date(at), months).getTime()

const atMost = (bound: number) => (value: number | null) => value !== null && value <= bound

const atLeast = (bound: number) => (value: number | null) => value !== null && value >= bound

function constraints(filters: ScopeFilters, at: string): Constraint[] {
  const list: Constraint[] = []
  const models = new Set(filters.model)
  const providers = new Set(filters.provider)

  if (models.size > 0) {
    list.push({ facet: 'model', test: (row) => models.has(row.model.id) })
  }

  if (providers.size > 0) {
    list.push({ facet: 'provider', test: (row) => providers.has(row.provider.id) })
  }

  for (const id of filters.with) {
    list.push({ facet: propertyFacet(id), test: (row) => row.properties.has(id) })
  }

  for (const id of filters.without) {
    list.push({ facet: propertyFacet(id), test: (row) => !row.properties.has(id) })
  }

  for (const facet of R.keys(RANGE_FACETS)) {
    const bound = filters[facet]

    if (bound !== undefined) {
      const { value, within } = RANGE_FACETS[facet]
      const accepts = within(bound, at)

      list.push({ facet, test: (row) => accepts(value(row)) })
    }
  }

  return list
}

/** Rows in scope, and rows that fail exactly one facet, by that facet. */
interface Evaluation {
  universe: EndpointRow[]
  matching: EndpointRow[]
  nearMisses: Map<Facet, EndpointRow[]>
}

const evaluations = new WeakMap<readonly EndpointRow[], { key: string; evaluation: Evaluation }>()

/**
 * One pass serves filtering, facet counts, and histograms: the rows matching every facet except one
 * are the matching rows plus those that fail only that facet. The latest result per row set is
 * cached.
 */
function evaluate(rows: readonly EndpointRow[], filters: ScopeFilters, at: string): Evaluation {
  const key = JSON.stringify([filters, at])
  const cached = evaluations.get(rows)

  if (cached?.key === key) {
    return cached.evaluation
  }

  const tests = constraints(filters, at)
  const evaluation: Evaluation = { matching: [], nearMisses: new Map(), universe: [] }

  for (const row of rows) {
    if (row.unlisted && !filters.unlisted) {
      continue
    }

    evaluation.universe.push(row)

    const failed = tests.filter(({ test }) => !test(row))
    const [only] = failed

    if (only === undefined) {
      evaluation.matching.push(row)
    } else if (failed.length === 1) {
      const misses = evaluation.nearMisses.get(only.facet) ?? []

      misses.push(row)
      evaluation.nearMisses.set(only.facet, misses)
    }
  }

  evaluations.set(rows, { evaluation, key })

  return evaluation
}

/**
 * `previous` with the entries of `next` that equal it carried over, so a part that did not change
 * keeps its identity, and `previous` itself when nothing changed.
 */
function reuseEqual<Result extends object>(previous: Result, next: Result): Result {
  const merged = { ...next }
  let changed = false

  for (const key in next) {
    if (R.isDeepEqual(previous[key], next[key])) {
      merged[key] = previous[key]
    } else {
      changed = true
    }
  }

  return changed ? merged : previous
}

/**
 * A result derived from the evaluation, computed once for each evaluation however many callers ask.
 * When the evaluation changes, parts of the new result equal to the last one keep their identity.
 * The latest result per row set is cached.
 */
function derive<Result extends object>(
  compute: (evaluation: Evaluation, at: string) => Result,
): (rows: readonly EndpointRow[], filters: ScopeFilters, at: string) => Result {
  const results = new WeakMap<readonly EndpointRow[], { evaluation: Evaluation; result: Result }>()

  return (rows, filters, at) => {
    const evaluation = evaluate(rows, filters, at)
    const cached = results.get(rows)

    if (cached?.evaluation === evaluation) {
      return cached.result
    }

    const computed = compute(evaluation, at)
    const result = cached === undefined ? computed : reuseEqual(cached.result, computed)

    results.set(rows, { evaluation, result })

    return result
  }
}

/** Rows matching every facet. */
export function applyFilters(
  rows: readonly EndpointRow[],
  filters: ScopeFilters,
  at: string,
): EndpointRow[] {
  return evaluate(rows, filters, at).matching
}

/** Rows matching every facet except the given one. */
function matchingOthers(evaluation: Evaluation, facet: Facet): EndpointRow[] {
  return [...evaluation.matching, ...(evaluation.nearMisses.get(facet) ?? [])]
}

/** Rows matching every other facet that have a property active (`with`) or inactive (`without`). */
interface PropertyCounts {
  with: number
  without: number
}

/**
 * Per-value counts: for each value, the rows matching every other facet that have that value.
 * A list value's count ignores the list facet's own selection, so it is not a total over the
 * selected values, and it includes rows already in scope.
 */
export interface FacetCounts {
  model: Map<string, number>
  provider: Map<string, number>
  properties: Map<PropertyId, PropertyCounts>
}

const countValues = (rows: readonly EndpointRow[], value: (row: EndpointRow) => string) =>
  new Map(Object.entries(R.countBy(rows, value)))

function countProperty(rows: readonly EndpointRow[], id: PropertyId): PropertyCounts {
  const active = rows.filter((row) => row.properties.has(id)).length

  return { with: active, without: rows.length - active }
}

/**
 * Per-value counts for the rows and filters. Callers with the same inputs share one result, and a
 * kind whose counts did not change since the last result keeps its map.
 */
export const facetCounts = derive((evaluation): FacetCounts => {
  const counts = new Map<PropertyId, PropertyCounts>()
  const active = new Map<PropertyId, number>()

  for (const row of evaluation.matching) {
    for (const id of row.properties.keys()) {
      active.set(id, (active.get(id) ?? 0) + 1)
    }
  }

  for (const id of R.keys(properties)) {
    const misses = evaluation.nearMisses.get(propertyFacet(id))
    const count = active.get(id) ?? 0

    counts.set(
      id,
      misses === undefined
        ? { with: count, without: evaluation.matching.length - count }
        : countProperty(matchingOthers(evaluation, propertyFacet(id)), id),
    )
  }

  return {
    model: countValues(matchingOthers(evaluation, 'model'), (row) => row.model.id),
    properties: counts,
    provider: countValues(matchingOthers(evaluation, 'provider'), (row) => row.provider.id),
  }
})

/**
 * Counts of row values in bins. `counts[i]` covers values from `thresholds[i - 1]` to `thresholds[i]`,
 * so the first and last bins are open-ended. Each bin holds the threshold its facet's bound keeps: a
 * minimum's bins include their lower threshold, a maximum's their upper, so a bound on a threshold
 * keeps whole bins. Rows without a value are `missing`.
 */
export interface Histogram {
  thresholds: readonly number[]
  counts: number[]
  missing: number
}

/** Thresholds by factors of about two and a half; free endpoints, at $0, fall in the first bin. */
const PRICE_THRESHOLDS = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50]

const THROUGHPUT_THRESHOLDS = [10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 1000]

/** Common context sizes, so 128,000 and 131,072 share a bin. */
const CONTEXT_THRESHOLDS = [
  8000, 16_000, 32_000, 64_000, 128_000, 200_000, 256_000, 400_000, 1_000_000, 2_000_000,
]

/** Monthly bins over the last year. */
const releaseThresholds = (at: string) =>
  R.range(0, 12).map((index) => releaseCutoff(at, 12 - index))

interface RangeDefinition {
  /** Which threshold each bin includes: the one a bound on it keeps. */
  closed: BinClosed
  value: (row: EndpointRow) => number | null
  /** Whether a value lies within a bound. */
  within: (bound: number, at: string) => (value: number | null) => boolean
  thresholds: (at: string) => readonly number[]
}

const RANGE_FACETS: Record<RangeFacet, RangeDefinition> = {
  maxInput: {
    closed: 'upper',
    thresholds: () => PRICE_THRESHOLDS,
    value: (row) => row.input,
    within: atMost,
  },
  minContext: {
    closed: 'lower',
    thresholds: () => CONTEXT_THRESHOLDS,
    value: (row) => row.context,
    within: atLeast,
  },
  minTps: {
    closed: 'lower',
    thresholds: () => THROUGHPUT_THRESHOLDS,
    value: (row) => row.throughput,
    within: atLeast,
  },
  released: {
    closed: 'lower',
    thresholds: releaseThresholds,
    value: (row) => row.released,
    within: (months, at) => atLeast(releaseCutoff(at, months)),
  },
}

/** Which threshold a histogram bin includes. */
export type BinClosed = 'lower' | 'upper'

export function histogram(
  values: readonly (number | null)[],
  thresholds: readonly number[],
  closed: BinClosed,
): Histogram {
  const counts = Array.from({ length: thresholds.length + 1 }, () => 0)
  let missing = 0

  for (const value of values) {
    if (value === null) {
      missing += 1
    } else {
      const found = thresholds.findIndex((threshold) =>
        closed === 'lower' ? value < threshold : value <= threshold,
      )

      const bin = found === -1 ? thresholds.length : found

      counts[bin] = (counts[bin] ?? 0) + 1
    }
  }

  return { counts, missing, thresholds }
}

/**
 * Each range facet's histogram over the rows matching every other facet. Callers with the same inputs
 * share one result, and a facet whose histogram did not change keeps it.
 */
export const rangeHistograms = derive((evaluation, at): Record<RangeFacet, Histogram> =>
  R.mapValues(RANGE_FACETS, ({ closed, thresholds, value }, facet) =>
    histogram(matchingOthers(evaluation, facet).map(value), thresholds(at), closed),
  ),
)

interface ScopeCount {
  inScope: number
  total: number
}

/** Endpoints, models, and providers in scope, against the universe the unlisted toggle allows. */
export interface ScopeSummary {
  endpoints: ScopeCount
  models: ScopeCount
  providers: ScopeCount
}

const distinct = (rows: readonly EndpointRow[], value: (row: EndpointRow) => string) =>
  new Set(rows.map(value)).size

/** Shared and identity-stable like `facetCounts`. */
export const scopeSummary = derive(({ matching, universe }): ScopeSummary => {
  const scope = (value: (row: EndpointRow) => string) => ({
    inScope: distinct(matching, value),
    total: distinct(universe, value),
  })

  return {
    endpoints: { inScope: matching.length, total: universe.length },
    models: scope((row) => row.model.id),
    providers: scope((row) => row.provider.id),
  }
})
