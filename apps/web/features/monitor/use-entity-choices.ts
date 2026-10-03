import type { api } from '@orca/backend/convex/_generated/api'
import { usePaginatedQuery } from 'convex-helpers/react/cache'
import type { PaginatedQueryArgs } from 'convex/react'
import { useEffect } from 'react'

export function useEntityChoices<
  Query extends typeof api.alerts.monitor.query.models | typeof api.alerts.monitor.query.providers,
>(query: Query, args: PaginatedQueryArgs<Query>) {
  const result = usePaginatedQuery(query, args, { initialNumItems: 1000 })
  const { status, loadMore } = result

  useEffect(() => {
    if (status === 'CanLoadMore') {
      loadMore(1000)
    }
  }, [status, loadMore])

  return result
}
