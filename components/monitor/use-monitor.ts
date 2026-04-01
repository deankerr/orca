import { useCallback, useState } from 'react'

import { convexQuery, useConvex } from '@convex-dev/react-query'
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'

import { api } from '@/convex/_generated/api'
import type { CrawlBatch } from '@/convex/monitor'
import { baseProviderSlug } from '@/convex/shared/utils'

const PAGE_SIZE = 10
const BATCH_QUERY_KEY = 'monitor:batch:v2'

function filterBatches(
  batches: CrawlBatch[],
  modelSlug: string,
  providerSlug: string,
): CrawlBatch[] {
  if (!modelSlug && !providerSlug) return batches

  const hasModelFilter = !!modelSlug
  const hasProviderFilter = !!providerSlug

  const result: CrawlBatch[] = []
  for (const batch of batches) {
    const changes = batch.changes.filter((change) => {
      if (hasModelFilter && hasProviderFilter) {
        if (change.entity_type !== 'endpoint') return false

        const modelOk = change.model.slug === modelSlug
        const providerOk = baseProviderSlug(change.provider.slug) === providerSlug
        return modelOk && providerOk
      }

      if (change.entity_type === 'model') {
        return hasModelFilter && change.model.slug === modelSlug
      }
      if (change.entity_type === 'provider') {
        return hasProviderFilter && baseProviderSlug(change.provider.slug) === providerSlug
      }

      const modelOk = !hasModelFilter || change.model.slug === modelSlug
      const providerOk =
        !hasProviderFilter || baseProviderSlug(change.provider.slug) === providerSlug
      return modelOk && providerOk
    })

    if (changes.length > 0) {
      result.push({ crawl_id: batch.crawl_id, changes })
    }
  }
  return result
}

export function useMonitor(modelSlug = '', providerSlug = '') {
  const convex = useConvex()
  const normalizedProviderSlug = providerSlug ? baseProviderSlug(providerSlug) : ''
  const filtersKey = `${modelSlug}\0${normalizedProviderSlug}`
  const [windowState, setWindowState] = useState(() => ({
    filtersKey,
    visibleCount: PAGE_SIZE,
  }))

  const visibleCount = windowState.filtersKey === filtersKey ? windowState.visibleCount : PAGE_SIZE

  const feedIdsQuery = useQuery({
    ...convexQuery(api.monitor.feedIds, {
      modelSlug: modelSlug || undefined,
      providerSlug: normalizedProviderSlug || undefined,
      limit: visibleCount,
    }),
    placeholderData: keepPreviousData,
  })

  const crawlIds = feedIdsQuery.data?.crawlIds ?? []
  const hasMore = feedIdsQuery.data?.hasMore ?? false

  const batchResults = useQueries({
    queries: crawlIds.map((crawl_id) => ({
      queryKey: [BATCH_QUERY_KEY, crawl_id],
      queryFn: () => convex.query(api.monitor.batch, { crawl_id }),
      staleTime: Infinity,
    })),
  })

  const batches = batchResults.flatMap((result) => (result.data ? [result.data] : []))
  const filteredBatches = filterBatches(batches, modelSlug, normalizedProviderSlug)

  const isFeedIdsFetching = feedIdsQuery.isFetching

  const loadMore = useCallback(() => {
    if (!hasMore || isFeedIdsFetching) return
    setWindowState((state) => ({
      filtersKey,
      visibleCount: (state.filtersKey === filtersKey ? state.visibleCount : PAGE_SIZE) + PAGE_SIZE,
    }))
  }, [filtersKey, hasMore, isFeedIdsFetching, setWindowState])

  return {
    batches: filteredBatches,
    isLoading: isFeedIdsFetching || batchResults.some((result) => result.isPending),
    hasMore,
    loadMore,
  }
}
