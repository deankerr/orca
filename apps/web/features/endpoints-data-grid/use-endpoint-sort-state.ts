import type { SortingState } from '@tanstack/react-table'
import { useQueryStates } from 'nuqs'

import { endpointGridParsers, endpointGridStateOptions } from './query-state'

function getEndpointGridSorting({
  sort,
  order,
  hasActiveQuery,
}: {
  sort: string | null
  order: 'asc' | 'desc' | null
  hasActiveQuery: boolean
}): SortingState {
  if (sort === null) {
    return hasActiveQuery ? [] : [{ id: 'modelAddedAt', desc: true }]
  }

  return [{ id: sort, desc: order === 'desc' }]
}

export function useEndpointSortState({ hasActiveQuery }: { hasActiveQuery: boolean }) {
  const [params, setParams] = useQueryStates(
    {
      sort: endpointGridParsers.sort,
      order: endpointGridParsers.order,
    },
    endpointGridStateOptions,
  )

  const sorting = getEndpointGridSorting({
    sort: params.sort,
    order: params.order,
    hasActiveQuery,
  })

  const onSortingChange = (
    updaterOrValue: SortingState | ((old: SortingState) => SortingState),
  ) => {
    const nextSorting =
      typeof updaterOrValue === 'function' ? updaterOrValue(sorting) : updaterOrValue

    if (nextSorting.length === 0) {
      void setParams({
        sort: null,
        order: null,
      })
      return
    }

    const [nextSort] = nextSorting
    if (nextSort === undefined) {
      return
    }

    void setParams({
      sort: nextSort.id,
      order: nextSort.desc ? 'desc' : 'asc',
    })
  }

  return {
    sorting,
    hasActiveSorting: params.sort !== null,
    onSortingChange,
  }
}
