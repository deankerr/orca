import { isPropertyId } from '@orca/properties'
import type { PropertyId } from '@orca/properties'
import * as R from 'remeda'
import { z } from 'zod'

import type { EndpointRow } from './rows'

/** Row fields the table can sort by. */
export const SORT_COLUMNS = [
  'model',
  'provider',
  'input',
  'output',
  'cacheRead',
  'blend',
  'throughput',
  'latency',
  'context',
  'released',
] as const satisfies readonly (keyof EndpointRow)[]

export type SortColumn = (typeof SORT_COLUMNS)[number]

/** A sort column, ascending, or prefixed with `-` for descending: `input`, `-throughput`. */
export type SortKey = SortColumn | `-${SortColumn}`

const isSortColumn = (value: string): value is SortColumn =>
  SORT_COLUMNS.some((column) => column === value)

const isSortKey = (value: unknown): value is SortKey =>
  typeof value === 'string' && isSortColumn(value.replace(/^-/u, ''))

export function parseSortKey(key: SortKey) {
  const descending = key.startsWith('-')
  const column = key.replace(/^-/u, '')

  return { column: isSortColumn(column) ? column : 'input', descending }
}

export function toSortKey(column: SortColumn, descending: boolean): SortKey {
  return descending ? `-${column}` : column
}

/** Release windows in months before the reference time. */
export const RELEASE_WINDOWS = [1, 3, 6, 12] as const

export type ReleaseWindow = (typeof RELEASE_WINDOWS)[number]

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

/**
 * The index route's search params. Invalid values fall back to their defaults, and defaults are
 * stripped from URLs, so a bare `/` is the default view.
 */
export const endpointSearchSchema = z
  .object({
    /** Selected endpoint UUID. */
    endpoint: z.string().min(1).optional().catch(undefined),
    /** Maximum input price in $/M. */
    maxInput: bound,
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
  .transform((search) => ({
    ...search,
    without: search.without.filter((id) => !search.with.includes(id)),
  }))

export type EndpointSearch = z.output<typeof endpointSearchSchema>

/** Values stripped from URLs. */
export const endpointSearchDefaults = {
  model: [],
  plot: true,
  provider: [],
  sort: 'input',
  unlisted: false,
  with: [],
  without: [],
} as const satisfies Partial<EndpointSearch>

/** Search params that narrow or widen the rows in scope. */
export type EndpointFilters = Pick<
  EndpointSearch,
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

/** A property facet's state: required active (`with`), required inactive (`without`), or neither. */
export type PropertyState = 'off' | 'with' | 'without'

export function propertyState(filters: Pick<EndpointFilters, 'with' | 'without'>, id: PropertyId) {
  if (filters.with.includes(id)) {
    return 'with'
  }

  return filters.without.includes(id) ? 'without' : 'off'
}

/** New `with` and `without` lists with a property in the given state. */
export function setPropertyState(
  filters: Pick<EndpointFilters, 'with' | 'without'>,
  id: PropertyId,
  state: PropertyState,
): Pick<EndpointFilters, 'with' | 'without'> {
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
} as const satisfies EndpointFilters

/** Filter values set away from their defaults: each list value, bound, and the unlisted toggle. */
export function activeFilterCount(filters: EndpointFilters): number {
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
