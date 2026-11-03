import type { SortingState } from '@tanstack/react-table'

import { isSortColumn, parseSortKey, toSortKey } from '#endpoints/sort'
import type { SortKey } from '#endpoints/sort'

/** The URL's sort key as the table's sorting state, which it reads and writes. */
export function toSortingState(key: SortKey): SortingState {
  const { column, descending } = parseSortKey(key)

  return [{ desc: descending, id: column }]
}

/** The sort key for table sorting state, or null when it names no sortable column. */
export function fromSortingState(sorting: SortingState): SortKey | null {
  const [first] = sorting

  return first !== undefined && isSortColumn(first.id) ? toSortKey(first.id, first.desc) : null
}

/** The direction a sort key orders a column, or false for any other column. */
export function sortDirection(key: SortKey, columnId: string): 'asc' | 'desc' | false {
  const { column, descending } = parseSortKey(key)

  if (column !== columnId) {
    return false
  }

  return descending ? 'desc' : 'asc'
}
