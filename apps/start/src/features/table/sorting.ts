import type { SortingState } from '@tanstack/react-table'

import { SORT_COLUMNS, parseSortKey, toSortKey } from '#features/endpoints/search'
import type { SortColumn, SortKey } from '#features/endpoints/search'

export function isSortColumn(id: string): id is SortColumn {
  return SORT_COLUMNS.some((column) => column === id)
}

/** The URL's sort as table sorting state. */
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
