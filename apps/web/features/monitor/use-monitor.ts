import { api } from '@orca/backend/api'
import type { MonitorScope } from '@orca/backend/monitor'
import { usePaginatedQuery } from 'convex-helpers/react/cache'

const PAGE_SIZE = 50

export function useMonitor(scope: MonitorScope) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.products.monitor.query.feed,
    { scope },
    { initialNumItems: PAGE_SIZE },
  )

  return {
    events: results,
    hasMore: status !== 'Exhausted',
    isLoading: status === 'LoadingFirstPage' || status === 'LoadingMore',
    loadMore: () => {
      loadMore(PAGE_SIZE)
    },
    status,
  }
}
