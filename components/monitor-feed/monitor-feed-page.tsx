'use client'

import { useEffect, useRef, useState } from 'react'

import { PaginationStatus, useConvex } from 'convex/react'

import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'

import { api } from '@/convex/_generated/api'
import { ChangeDoc } from '@/convex/feed'

import { ModelCombobox } from '@/components/shared/or-entity-combobox'
import { PaginatedLoadButton } from '@/components/shared/paginated-load-button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDateTime, formatRelativeTime } from '@/lib/formatters'
import { cn } from '@/lib/utils'

import { FeedItem } from './monitor-feed-item'

type FlatItem = { type: 'marker'; crawl_id: string } | { type: 'item'; change: ChangeDoc }

function useMonitorFeed(modelSlug: string | undefined) {
  const convex = useConvex()

  const query = useInfiniteQuery({
    queryKey: ['monitor-feed', modelSlug],
    queryFn: async ({ pageParam }) => {
      return convex.query(api.feed.changesByCrawlId, {
        modelSlug: modelSlug || undefined,
        paginationOpts: { numItems: 1, cursor: pageParam },
      })
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.isDone ? undefined : lastPage.continueCursor),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
  })

  // * Flatten pages into single list
  const changes = query.data?.pages.flatMap((page) => page.page) ?? []

  // * Insert markers when crawl_id changes
  const flatItems: FlatItem[] = []
  let lastCrawlId = ''
  for (const change of changes) {
    if (change.crawl_id !== lastCrawlId) {
      flatItems.push({ type: 'marker', crawl_id: change.crawl_id })
      lastCrawlId = change.crawl_id
    }
    flatItems.push({ type: 'item', change })
  }

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
    flatItems,
    status,
    loadMore,
  }
}

export function MonitorFeed() {
  const [modelSlug, setModelSlug] = useState<string>('')
  const { flatItems, status, loadMore } = useMonitorFeed(modelSlug)
  const scrollRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (flatItems[index].type === 'marker' ? 72 : 44), // pt-4 + content + pb-8 ≈ 72, content + pb-4 ≈ 44
    overscan: 10,
    getItemKey: (index) => {
      const item = flatItems[index]
      return item.type === 'marker' ? `marker-${item.crawl_id}` : item.change._id
    },
  })

  const virtualItems = virtualizer.getVirtualItems()

  // * Trigger loadMore when nearing the end
  const lastItemIndex = virtualItems.at(-1)?.index ?? 0
  useEffect(() => {
    if (lastItemIndex >= flatItems.length - 10 && status === 'CanLoadMore') {
      loadMore()
    }
  }, [lastItemIndex, flatItems.length, status, loadMore])

  const totalSize = virtualizer.getTotalSize()

  return (
    <>
      <div className="mx-auto max-w-7xl px-2 py-4 sm:px-6">
        <ModelCombobox value={modelSlug} onValueChange={setModelSlug} />
      </div>
      <ScrollArea className="flex-1 rounded-none" viewportRef={scrollRef} maskHeight={5}>
        <div className="mx-auto max-w-7xl px-2 py-4 sm:px-6">
          <div className="relative" style={{ height: totalSize }}>
            {virtualItems.map((virtualRow) => {
              const item = flatItems[virtualRow.index]
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="absolute right-0 left-0"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  {item.type === 'marker' ? (
                    <TimelineMarker crawl_id={item.crawl_id} className="pt-4 pb-8" />
                  ) : (
                    <div className="ml-2 pb-4 font-mono text-sm leading-loose text-muted-foreground sm:pl-2">
                      <FeedItem change={item.change} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-center py-4">
            <PaginatedLoadButton status={status} onClick={() => loadMore()} />
          </div>
        </div>
      </ScrollArea>
    </>
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
