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
    return hasActiveQuery ? [] : [{ desc: true, id: 'modelAddedAt' }]
  }

  return [{ desc: order === 'desc', id: sort }]
}

export function useEndpointSortState({ hasActiveQuery }: { hasActiveQuery: boolean }) {
  const [params, setParams] = useQueryStates(
    {
      order: endpointGridParsers.order,
      sort: endpointGridParsers.sort,
    },
    endpointGridStateOptions,
  )

  const sorting = getEndpointGridSorting({
    hasActiveQuery,
    order: params.order,
    sort: params.sort,
  })

  const onSortingChange = (
    updaterOrValue: SortingState | ((old: SortingState) => SortingState),
  ) => {
    const nextSorting =
      typeof updaterOrValue === 'function' ? updaterOrValue(sorting) : updaterOrValue

    if (nextSorting.length === 0) {
      void setParams({
        order: null,
        sort: null,
      })

      return
    }

    const [nextSort] = nextSorting

    if (nextSort === undefined) {
      return
    }

    void setParams({
      order: nextSort.desc ? 'desc' : 'asc',
      sort: nextSort.id,
    })
  }

  return {
    hasActiveSorting: params.sort !== null,
    onSortingChange,
    sorting,
  }
}
