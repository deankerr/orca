import type { PaginationStatus } from 'convex/react'
import { useEffect, useRef } from 'react'

export function useInfiniteScroll(
  onLoadMore: () => void,
  {
    status,
  }: {
    status: PaginationStatus
  },
) {
  const viewportRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const viewport = viewportRef.current

    if (!viewport || status === 'Exhausted') {
      return undefined
    }

    const loadIfNearBottom = () => {
      if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 400) {
        onLoadMore()
      }
    }

    // Recheck after every page, including empty pages that leave the viewport unchanged.
    // Convex ignores loadMore while a page is already loading.
    loadIfNearBottom()
    viewport.addEventListener('scroll', loadIfNearBottom, { passive: true })
    return () => {
      viewport.removeEventListener('scroll', loadIfNearBottom)
    }
  }, [onLoadMore, status])

  return viewportRef
}
