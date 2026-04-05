'use client'

import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback } from 'react'

import { useInfiniteScroll } from '@/hooks/use-infinite-scroll'

import { PageLoading } from '../app-layout/pages'
import { flattenMonitorFeed, MonitorFeedRowItem } from './crawl-batch'
import { FilterBar } from './filter-bar'
import { useMonitor } from './use-monitor'
import { useMonitorFilters } from './use-monitor-filters'

export function MonitorPage() {
  const filters = useMonitorFilters()
  const monitor = useMonitor(filters.modelSlug, filters.providerSlug)

  const viewportRef = useInfiniteScroll(monitor.loadMore, {
    hasMore: monitor.hasMore,
  })
  const feedRows = flattenMonitorFeed(monitor.batches)

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: feedRows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: (index) => (feedRows[index]?.kind === 'batch-header' ? 44 : 160),
    overscan: 8,
    getItemKey: useCallback((index: number) => feedRows[index]?.key ?? index, [feedRows]),
  })
  const virtualRows = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <>
      <FilterBar filters={filters} />

      <div ref={viewportRef} className="flex-1 overflow-y-auto">
        {feedRows.length > 0 ? (
          <>
            <div className="relative w-full" style={{ height: totalSize }}>
              {virtualRows.map((virtualRow) => {
                const row = feedRows[virtualRow.index]
                if (!row) {
                  return null
                }

                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <MonitorFeedRowItem row={row} />
                  </div>
                )
              })}
            </div>
            <div className="h-12" />

            {monitor.isLoading && (
              <div className="mx-auto w-full max-w-2xl px-3 pb-12">
                <PageLoading />
              </div>
            )}
          </>
        ) : (
          <div className="mx-auto w-full max-w-2xl px-3 pt-6 pb-12">
            {monitor.isLoading ? (
              <PageLoading />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {filters.hasActiveFilters
                  ? 'No changes match these filters'
                  : 'No changes detected yet'}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  )
}
