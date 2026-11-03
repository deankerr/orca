import type { EndpointRow } from './snapshot'

/** Row fields the table can sort by. */
const SORT_COLUMNS = [
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

const comparators: Record<SortColumn, (descending: boolean) => Compare> = {
  blend: byNumber((row) => row.blend),
  cacheRead: byNumber((row) => row.cacheRead),
  context: byNumber((row) => row.context),
  input: byNumber((row) => row.input),
  latency: byNumber((row) => row.latency),
  model: reversible(byText((row) => row.model.name)),
  output: byNumber((row) => row.output),
  provider: reversible(byText((row) => row.provider.display_name)),
  released: byNumber((row) => row.released),
  throughput: byNumber((row) => row.throughput),
}

/** Ties fall back to model name, provider name, then endpoint ID, so order is stable across scans. */
const tieBreak: Compare = (left, right) =>
  collator.compare(left.model.name, right.model.name) ||
  collator.compare(left.provider.display_name, right.provider.display_name) ||
  left.id.localeCompare(right.id)

/** Rows ordered by a sort key; absent numbers sort last in either direction. */
export function sortRows(rows: readonly EndpointRow[], key: SortKey): EndpointRow[] {
  const { column, descending } = parseSortKey(key)
  const compare = comparators[column](descending)

  return rows.toSorted((left, right) => compare(left, right) || tieBreak(left, right))
}
