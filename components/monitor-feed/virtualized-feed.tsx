import { useCallback, useRef } from 'react'

import { useVirtualizer } from '@tanstack/react-virtual'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

import { Spinner } from '../ui/spinner'
import { FeedItem } from './monitor-feed-item'
import { TimelineMarker } from './timeline-marker'
import { FeedItem as FeedItemType } from './use-monitor-feed'

const ITEM_HEIGHT = 44
const MARKER_HEIGHT = 72
const LOAD_MORE_THRESHOLD = 50

export function VirtualizedFeed({
  items,
  loadMore,
  hasNextPage,
  isFetchingNextPage,
}: {
  items: FeedItemType[]
  loadMore: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
}) {
  'use no memo'
  const scrollRef = useRef<HTMLDivElement>(null)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      return items[index].type === 'marker' ? MARKER_HEIGHT : ITEM_HEIGHT
    },
    overscan: 10,
    getItemKey: useCallback(
      (index: number) => {
        return items[index].type === 'marker'
          ? `marker-${items[index].crawl_id}`
          : items[index].change._id
      },
      [items],
    ),
    onChange: (instance) => {
      if (!hasNextPage) return

      const virtualItems = instance.getVirtualItems()
      const lastIndex = virtualItems.at(-1)?.index ?? 0
      if (lastIndex >= items.length - LOAD_MORE_THRESHOLD) {
        loadMore()
      }
    },
  })

  return (
    <ScrollArea className="flex-1 rounded-none" viewportRef={scrollRef} maskHeight={5}>
      <div className="mx-auto max-w-7xl px-2 py-3 sm:px-6">
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index]
            if (!item) return null

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
          {isFetchingNextPage ? (
            <Button disabled variant="outline">
              <Spinner /> Loading
            </Button>
          ) : hasNextPage ? (
            <Button variant="outline" onClick={loadMore}>
              Load More
            </Button>
          ) : items.length > 0 ? (
            <span className="text-sm text-muted-foreground">No more changes</span>
          ) : null}
        </div>
      </div>
    </ScrollArea>
  )
}
