import { defaultWorkload } from '@orca/pricing'
import type { Workload } from '@orca/pricing'
import { isPropertyId } from '@orca/properties'
import type { PropertyId } from '@orca/properties'
import * as R from 'remeda'
import { z } from 'zod'

import { RELEASE_WINDOWS } from './filtering'
import { isSortKey } from './sort'
import type { SortKey } from './sort'

/**
 * A URL list: comma-joined text, which the router parses as a string, a number, or a boolean when it
 * has one item, or an array from navigation. Items are unique, in first-seen order.
 */
const list = z
  .union([z.array(z.string()), z.string(), z.number(), z.boolean()])
  .transform((value) =>
    R.unique(
      (Array.isArray(value) ? value : String(value).split(',')).filter((item) => item !== ''),
    ),
  )

const propertyList = list.transform((ids) => ids.filter(isPropertyId))

/** The default `ratio` and `hit` params: the default workload's numbers. */
const DEFAULT_RATIO = defaultWorkload.ratio
const DEFAULT_HIT = Math.round(defaultWorkload.hitRate * 100)

/** The largest workload ratio a URL may carry. */
export const MAX_RATIO = 1000

const bound = z.number().positive().optional().catch(undefined)

/** Zero is a real price, so a zero maximum keeps only free endpoints. */
const priceBound = z.number().nonnegative().optional().catch(undefined)

/**
 * The index route's scope, as URL search params: the filters that put rows in scope, plus the sort,
 * the workload, the plot toggle, and the selected endpoint. Invalid values fall back to their defaults, and
 * defaults are stripped from URLs, so a bare `/` is the default view.
 */
export const scopeSchema = z
  .object({
    /** Selected endpoint UUID. */
    endpoint: z.string().min(1).optional().catch(undefined),
    /** Workload cache hit rate, as an integer percent from 0 to 100. */
    hit: z.number().int().min(0).max(100).default(DEFAULT_HIT).catch(DEFAULT_HIT),
    /** Maximum input price in $/M. */
    maxInput: priceBound,
    /** Minimum context length in tokens. */
    minContext: bound,
    /** Minimum median throughput in tokens per second. */
    minTps: bound,
    /** Model IDs, any of which may match. */
    model: list.default([]).catch([]),
    plot: z.boolean().default(true).catch(true),
    /** Provider IDs, any of which may match. */
    provider: list.default([]).catch([]),
    /** Workload input tokens per output token, above 0 and at most `MAX_RATIO`. */
    ratio: z.number().positive().max(MAX_RATIO).default(DEFAULT_RATIO).catch(DEFAULT_RATIO),
    /** Models created within this many months of the reference time. */
    released: z.literal(RELEASE_WINDOWS).optional().catch(undefined),
    sort: z.custom<SortKey>(isSortKey).default('input').catch('input'),
    /** Also show unlisted endpoints. */
    unlisted: z.boolean().default(false).catch(false),
    /** Properties that must be active. */
    with: propertyList.default([]).catch([]),
    /** Properties that must be inactive; a property in `with` wins. */
    without: propertyList.default([]).catch([]),
  })
  .transform((scope) => ({
    ...scope,
    without: scope.without.filter((id) => !scope.with.includes(id)),
  }))

export type Scope = z.output<typeof scopeSchema>

/** Values stripped from URLs. */
export const scopeDefaults = {
  hit: DEFAULT_HIT,
  model: [],
  plot: true,
  provider: [],
  ratio: DEFAULT_RATIO,
  sort: 'input',
  unlisted: false,
  with: [],
  without: [],
} as const satisfies Partial<Scope>

/** The workload a scope's `ratio` and `hit` params describe. */
export function scopeWorkload(scope: Pick<Scope, 'hit' | 'ratio'>): Workload {
  return { hitRate: scope.hit / 100, ratio: scope.ratio }
}

/**
 * The `ratio` and `hit` params that describe a workload's numbers; the hit rate rounds to a whole
 * percent. A number the change leaves out is left out of the params too, so merging them into a scope
 * (as the search updater does, from the scope it is given) changes only the params it names.
 */
export function workloadParams(workload: Partial<Workload>): Partial<Pick<Scope, 'hit' | 'ratio'>> {
  const params: Partial<Pick<Scope, 'hit' | 'ratio'>> = {}

  if (workload.hitRate !== undefined) {
    params.hit = Math.round(workload.hitRate * 100)
  }

  if (workload.ratio !== undefined) {
    params.ratio = workload.ratio
  }

  return params
}

/** The scope's filters: the params that narrow or widen the rows in scope. */
export type ScopeFilters = Pick<
  Scope,
  | 'maxInput'
  | 'minContext'
  | 'minTps'
  | 'model'
  | 'provider'
  | 'released'
  | 'unlisted'
  | 'with'
  | 'without'
>

/** The scope's filters alone, as a fresh object: the sort, workload, plot toggle, and selection are dropped. */
export function scopeFilters(scope: ScopeFilters): ScopeFilters {
  return {
    maxInput: scope.maxInput,
    minContext: scope.minContext,
    minTps: scope.minTps,
    model: scope.model,
    provider: scope.provider,
    released: scope.released,
    unlisted: scope.unlisted,
    with: scope.with,
    without: scope.without,
  }
}

/** The property filters alone, as a fresh object. */
export function propertyFilters(scope: ScopeFilters): Pick<ScopeFilters, 'with' | 'without'> {
  return { with: scope.with, without: scope.without }
}

/** A property facet's state: required active (`with`), required inactive (`without`), or neither. */
export type PropertyState = 'off' | 'with' | 'without'

export function propertyState(filters: Pick<ScopeFilters, 'with' | 'without'>, id: PropertyId) {
  if (filters.with.includes(id)) {
    return 'with'
  }

  return filters.without.includes(id) ? 'without' : 'off'
}

/** New `with` and `without` lists with a property in the given state. */
export function setPropertyState(
  filters: Pick<ScopeFilters, 'with' | 'without'>,
  id: PropertyId,
  state: PropertyState,
): Pick<ScopeFilters, 'with' | 'without'> {
  const others = (ids: readonly PropertyId[]) => ids.filter((other) => other !== id)

  return {
    with: state === 'with' ? [...others(filters.with), id] : others(filters.with),
    without: state === 'without' ? [...others(filters.without), id] : others(filters.without),
  }
}

/** Adds a list value, or removes it when present. */
export function toggleValue<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((other) => other !== value) : [...values, value]
}

/** Every filter at its default; sort, workload, selection, and plot stay. */
export const clearedFilters = {
  maxInput: undefined,
  minContext: undefined,
  minTps: undefined,
  model: [],
  provider: [],
  released: undefined,
  unlisted: false,
  with: [],
  without: [],
} as const satisfies ScopeFilters

/** Filter values set away from their defaults: each list value, bound, and the unlisted toggle. */
export function activeFilterCount(filters: ScopeFilters): number {
  const bounds = [filters.maxInput, filters.minContext, filters.minTps, filters.released]

  return (
    filters.model.length +
    filters.provider.length +
    filters.with.length +
    filters.without.length +
    bounds.filter((value) => value !== undefined).length +
    (filters.unlisted ? 1 : 0)
  )
}
