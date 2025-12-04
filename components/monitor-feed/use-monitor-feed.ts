import { useConvex } from 'convex/react'

import { useInfiniteQuery } from '@tanstack/react-query'

import { api } from '@/convex/_generated/api'
import { ChangeDoc } from '@/convex/feed'

export type FeedItem = { type: 'marker'; crawl_id: string } | { type: 'item'; change: ChangeDoc }
export type EntityTypeFilter = 'model' | 'endpoint' | ''

export function useMonitorFeed(entityType: EntityTypeFilter, modelSlug: string) {
  const convex = useConvex()

  const query = useInfiniteQuery({
    queryKey: ['monitor-feed', entityType, modelSlug],
    queryFn: async ({ pageParam }) => {
      return convex.query(api.feed.changesByCrawlId, {
        entityType: entityType || undefined,
        modelSlug: modelSlug || undefined,
        paginationOpts: { numItems: 1, cursor: pageParam },
      })
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.isDone ? undefined : lastPage.continueCursor),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  })

  // * Flatten pages and insert timeline markers between crawl_id groups
  const changes = query.data?.pages.flatMap((page) => page.page) ?? []
  const items: FeedItem[] = []
  let lastCrawlId = ''

  for (const change of changes) {
    if (change.crawl_id !== lastCrawlId) {
      items.push({ type: 'marker', crawl_id: change.crawl_id })
      lastCrawlId = change.crawl_id
    }
    items.push({ type: 'item', change })
  }

  // * Safe fetchNextPage that guards against concurrent fetches
  const canFetch = query.hasNextPage && !query.isFetching
  const loadMore = () => {
    if (canFetch) query.fetchNextPage()
  }

  return {
    items,
    loadMore,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
  }
}
