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

const bound = z.number().positive().optional().catch(undefined)

/** Zero is a real price, so a zero maximum keeps only free endpoints. */
const priceBound = z.number().nonnegative().optional().catch(undefined)

/**
 * The index route's scope, as URL search params: the filters that put rows in scope, plus the sort,
 * the plot toggle, and the selected endpoint. Invalid values fall back to their defaults, and
 * defaults are stripped from URLs, so a bare `/` is the default view.
 */
export const scopeSchema = z
  .object({
    /** Selected endpoint UUID. */
    endpoint: z.string().min(1).optional().catch(undefined),
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
  model: [],
  plot: true,
  provider: [],
  sort: 'input',
  unlisted: false,
  with: [],
  without: [],
} as const satisfies Partial<Scope>

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

/** The scope's filters alone, as a fresh object: the sort, plot toggle, and selection are dropped. */
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

/** Every filter at its default; sort, selection, and plot stay. */
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
