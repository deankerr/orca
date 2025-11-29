'use client'

import { PaginationStatus, useConvex } from 'convex/react'

import { useInfiniteQuery } from '@tanstack/react-query'

import { api } from '@/convex/_generated/api'
import { ChangeDoc } from '@/convex/feed'

import { PaginatedLoadButton } from '@/components/shared/paginated-load-button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll'
import { formatDateTime, formatRelativeTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'

import { FeedItem } from './monitor-feed-item'

function useMonitorFeed() {
  const convex = useConvex()

  const query = useInfiniteQuery({
    queryKey: ['monitor-feed'],
    queryFn: async ({ pageParam }) => {
      return convex.query(api.feed.changesByCrawlId, {
        paginationOpts: { numItems: 1, cursor: pageParam },
      })
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.isDone ? undefined : lastPage.continueCursor),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  })

  // * Flatten pages into results array matching previous interface
  const results = query.data?.pages.flatMap((page) => page.page) ?? []

  // * Map TanStack status to Convex-style pagination status
  const status: PaginationStatus =
    query.status === 'pending'
      ? 'LoadingFirstPage'
      : query.isFetchingNextPage
        ? 'LoadingMore'
        : query.hasNextPage
          ? 'CanLoadMore'
          : 'Exhausted'

  // * Safe loadMore that guards against concurrent fetches
  // TanStack warns: calling fetchNextPage during ongoing fetch can overwrite data
  const canFetch = query.hasNextPage && !query.isFetching
  const loadMore = () => {
    if (canFetch) query.fetchNextPage()
  }

  return {
    results,
    status,
    loadMore,
  }
}

export function MonitorFeed() {
  const { results, status, loadMore } = useMonitorFeed()

  const viewportRef = useInfiniteScroll(() => loadMore(), {
    hasMore: status === 'CanLoadMore',
    threshold: 1400,
  })

  return (
    <ScrollArea className="flex-1 rounded-none" viewportRef={viewportRef} maskHeight={10}>
      <div className="mx-auto max-w-7xl space-y-8 px-2 py-6 sm:px-6">
        {results
          .filter((r) => r.data.length)
          .map(({ crawl_id, data: changes }) => (
            <div key={crawl_id} className="space-y-8 text-sm">
              <TimelineMarker crawl_id={crawl_id} />

              <ul className="ml-2 list-disc space-y-6 font-mono leading-loose text-muted-foreground sm:pl-2">
                {changes.map((change: ChangeDoc) => (
                  <FeedItem key={change._id} change={change} />
                ))}
              </ul>
            </div>
          ))}

        <div className="flex items-center justify-center py-4">
          <PaginatedLoadButton status={status} onClick={() => loadMore()} />
        </div>
      </div>
    </ScrollArea>
  )
}

function TimelineMarker({ crawl_id, className }: { crawl_id: string; className?: string }) {
  const timestamp = Number(crawl_id)
  const localTime = formatDateTime(timestamp)

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <div className="h-px flex-1 border-b border-dashed" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="secondary" className="font-mono">
            {formatRelativeTime(timestamp)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="font-mono">{localTime}</TooltipContent>
      </Tooltip>
      <div className="h-px flex-1 border-b border-dashed" />
    </div>
  )
}
