import { defaultWorkload, workloadCost } from '@orca/pricing'
import type { Workload } from '@orca/pricing'

import type { EndpointRow } from './snapshot'

/** Row fields the table can sort by, and `cost`, which derives from the row under a workload. */
const SORT_COLUMNS = [
  'model',
  'provider',
  'input',
  'output',
  'cacheRead',
  'cost',
  'throughput',
  'latency',
  'context',
  'released',
] as const satisfies readonly (keyof EndpointRow | 'cost')[]

export type SortColumn = (typeof SORT_COLUMNS)[number]

/** A sort column, ascending, or prefixed with `-` for descending: `input`, `-throughput`. */
export type SortKey = SortColumn | `-${SortColumn}`

/** The sort a URL without one opens on: newest model first (see `released` in `comparators`). */
export const DEFAULT_SORT: SortKey = '-released'

export const isSortColumn = (value: string): value is SortColumn =>
  SORT_COLUMNS.some((column) => column === value)

export const isSortKey = (value: unknown): value is SortKey =>
  typeof value === 'string' && isSortColumn(value.replace(/^-/u, ''))

export function parseSortKey(key: SortKey) {
  const descending = key.startsWith('-')
  const column = key.replace(/^-/u, '')

  return { column: isSortColumn(column) ? column : 'input', descending }
}

export function toSortKey(column: SortColumn, descending: boolean): SortKey {
  return descending ? `-${column}` : column
}

/**
 * The workload a sort depends on: the one given when sorting by cost, else `defaultWorkload`, a constant,
 * so a workload change neither re-sorts nor invalidates a memo under any other sort.
 */
export function sortWorkload(key: SortKey, workload: Workload): Workload {
  return parseSortKey(key).column === 'cost' ? workload : defaultWorkload
}

type Compare = (left: EndpointRow, right: EndpointRow) => number

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

const byText =
  (value: (row: EndpointRow) => string): Compare =>
  (left, right) =>
    collator.compare(value(left), value(right))

/** Absent values sort last in either direction. */
const byNumber =
  (value: (row: EndpointRow) => number | null) =>
  (descending: boolean): Compare =>
  (left, right) => {
    const a = value(left)
    const b = value(right)

    if (a === null || b === null) {
      return (a === null ? 1 : 0) - (b === null ? 1 : 0)
    }

    return descending ? b - a : a - b
  }

const reversible =
  (compare: Compare) =>
  (descending: boolean): Compare =>
  (left, right) =>
    descending ? compare(right, left) : compare(left, right)

const byModelId: Compare = (left, right) => left.model.id.localeCompare(right.model.id)

/**
 * By model release time, then model, so each model's endpoints stay together even where two models
 * share a release time, and within a model by input price ascending, absent last, in either direction.
 */
const byRelease = (descending: boolean): Compare => {
  const released = byNumber((row) => row.released)(descending)
  const input = byNumber((row) => row.input)(false)

  return (left, right) => released(left, right) || byModelId(left, right) || input(left, right)
}

const comparators = (workload: Workload): Record<SortColumn, (descending: boolean) => Compare> => ({
  cacheRead: byNumber((row) => row.cacheRead),
  context: byNumber((row) => row.context),
  cost: byNumber((row) => workloadCost(row, workload)),
  input: byNumber((row) => row.input),
  latency: byNumber((row) => row.latency),
  model: reversible(byText((row) => row.model.name)),
  output: byNumber((row) => row.output),
  provider: reversible(byText((row) => row.provider.display_name)),
  released: byRelease,
  throughput: byNumber((row) => row.throughput),
})

/** Ties fall back to model name, provider name, then endpoint ID, so order is stable across scans. */
const tieBreak: Compare = (left, right) =>
  collator.compare(left.model.name, right.model.name) ||
  collator.compare(left.provider.display_name, right.provider.display_name) ||
  left.id.localeCompare(right.id)

/**
 * Rows ordered by a sort key; absent numbers sort last in either direction. The workload matters only
 * to the `cost` column.
 */
export function sortRows(
  rows: readonly EndpointRow[],
  key: SortKey,
  workload: Workload,
): EndpointRow[] {
  const { column, descending } = parseSortKey(key)
  const compare = comparators(workload)[column](descending)

  return rows.toSorted((left, right) => compare(left, right) || tieBreak(left, right))
}
