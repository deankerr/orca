import { api } from '@orca/backend/convex/_generated/api'
import type { MonitorScope } from '@orca/backend/convex/alerts/monitor/query'
import { usePaginatedQuery } from 'convex-helpers/react/cache'

const PAGE_SIZE = 50

export function useMonitor(scope: MonitorScope) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.alerts.monitor.query.feed,
    { scope },
    { initialNumItems: PAGE_SIZE },
  )

  return {
    events: results,
    status,
    isLoading: status === 'LoadingFirstPage' || status === 'LoadingMore',
    hasMore: status !== 'Exhausted',
    loadMore: () => {
      loadMore(PAGE_SIZE)
    },
  }
}
