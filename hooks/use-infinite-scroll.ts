import { useCallback, useEffect, useRef } from 'react'

interface UseInfiniteScrollOptions {
  /** Distance from bottom (in pixels) to trigger load more. @default 400 */
  threshold?: number
  /** Whether more content is available to load */
  hasMore: boolean
}

/**
 * Hook for implementing infinite scrolling in a scrollable container.
 *
 * Automatically loads more content when user scrolls near the bottom,
 * and ensures there's enough content to enable scrolling in the first place.
 *
 * @param onLoadMore - Function to call when more content should be loaded
 * @param options - Configuration options
 * @returns Ref to attach to the scrollable viewport element
 *
 * @example
 * ```tsx
 * const viewportRef = useInfiniteScroll(() => loadMore(1), {
 *   hasMore: status === 'CanLoadMore',
 *   threshold: 400,
 * })
 *
 * <div ref={viewportRef} className="overflow-y-auto">
 *   <div>Content here...</div>
 * </div>
 * ```
 */
export function useInfiniteScroll(onLoadMore: () => void, options: UseInfiniteScrollOptions) {
  const { threshold = 400, hasMore } = options
  const scrollElementRef = useRef<HTMLDivElement | null>(null)

  const checkAndLoadMore = useCallback(() => {
    const scrollElement = scrollElementRef.current
    if (!scrollElement || !hasMore) return

    const { scrollTop, scrollHeight, clientHeight } = scrollElement
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight

    if (distanceFromBottom <= threshold) {
      onLoadMore()
    }
  }, [onLoadMore, threshold, hasMore])

  // Note: We don't add local protection against rapid repeated calls to onLoadMore
  // because the data fetching hooks we use (like usePaginatedQuery) already have
  // this protection built-in. Adding it here would be redundant.

  const handleScroll = useCallback(() => {
    checkAndLoadMore()
  }, [checkAndLoadMore])

  useEffect(() => {
    const scrollElement = scrollElementRef.current
    if (!scrollElement) return

    scrollElement.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      scrollElement.removeEventListener('scroll', handleScroll)
    }
  }, [handleScroll])

  useEffect(() => {
    const scrollElement = scrollElementRef.current
    if (!scrollElement) return

    const { scrollHeight, clientHeight } = scrollElement

    if (scrollHeight <= clientHeight && hasMore) {
      onLoadMore()
    }
  }, [hasMore, onLoadMore])

  return scrollElementRef
}
