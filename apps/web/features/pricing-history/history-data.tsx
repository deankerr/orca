import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useQueries, useQuery } from '@tanstack/react-query'
import { usePaginatedQuery } from 'convex-helpers/react/cache'
import type { PaginationStatus } from 'convex/react'
import { Component, useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import type { PricingHistory } from './data'

const PAGE_SIZE = 1000
export type HistoryDataState = {
  data: PricingHistory
  isPending: boolean
  error: Error | null | undefined
  refetch: () => Promise<void>
}

type PriceSubscription = {
  results: PricingHistory['endpoints'][number]['prices']
  status: PaginationStatus
}

/** Own subscription mounting and retry; the view only receives the aggregate loading state. */
export function HistoryData({
  modelId,
  children,
}: {
  modelId: string
  children: (state: HistoryDataState) => ReactNode
}) {
  const [attempt, setAttempt] = useState(0)
  const [prices, setPrices] = useState<Record<string, PriceSubscription | Error>>({})
  const clock = useQuery(convexQuery(api.v4.clock.observe, {}))
  const members = useQuery(
    convexQuery(api.v4.history.listings.query.endpoints, { model_id: modelId }),
  )
  const ids = members.data ?? []
  const listings = useQueries({
    queries: ids.map((endpoint_id) =>
      convexQuery(api.v4.history.listings.query.forEndpoint, { endpoint_id }),
    ),
  })
  const updatePrices = useCallback((id: string, result: PriceSubscription | Error) => {
    setPrices((previous) => ({ ...previous, [id]: result }))
  }, [])

  const data: PricingHistory = {
    modelId,
    asOf: clock.data === undefined || clock.data === null ? 0 : Date.parse(clock.data),
    endpoints: ids.map((id, index) => {
      const result = prices[id]
      return {
        id,
        listings: listings[index].data ?? [],
        prices: result instanceof Error ? [] : (result?.results ?? []),
      }
    }),
  }

  const state: HistoryDataState = {
    data,
    isPending:
      clock.isPending ||
      members.isPending ||
      listings.some((result) => result.isPending) ||
      ids.some((id) => {
        const result = prices[id]
        return !(result instanceof Error) && result?.status !== 'Exhausted'
      }),
    error:
      clock.error ??
      members.error ??
      listings.find((result) => result.error)?.error ??
      ids.map((id) => prices[id]).find((result) => result instanceof Error),
    refetch: async () => {
      // ponytail: Remounts can reuse cached page errors; add fresh-subscription recovery if needed.
      setPrices({})
      setAttempt((value) => value + 1)
      await Promise.all([
        clock.refetch(),
        members.refetch(),
        ...listings.map(async (result) => await result.refetch()),
      ])
    },
  }

  return (
    <>
      {ids.map((id) => (
        <PriceErrorBoundary key={`${id}:${attempt}`} endpointId={id} onResult={updatePrices}>
          <EndpointPrices endpointId={id} onResult={updatePrices} />
        </PriceErrorBoundary>
      ))}
      {children(state)}
    </>
  )
}

type PriceSubscriptionProps = {
  endpointId: string
  onResult: (id: string, result: PriceSubscription | Error) => void
}

/** Cached pagination keeps endpoint pages subscribed across brief overlay visits. */
function EndpointPrices({ endpointId, onResult }: PriceSubscriptionProps) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.v4.history.pricing.query.observe,
    { endpoint_id: endpointId },
    { initialNumItems: PAGE_SIZE },
  )

  useEffect(() => {
    if (status === 'CanLoadMore') {
      loadMore(PAGE_SIZE)
    }
  }, [status, loadMore])

  useEffect(() => {
    onResult(endpointId, { results, status })
  }, [endpointId, onResult, results, status])

  return null
}

/** Native pagination throws page failures; surface them in the product's retry state. */
class PriceErrorBoundary extends Component<
  PriceSubscriptionProps & { children: ReactNode },
  { failed: boolean }
> {
  constructor(props: PriceSubscriptionProps & { children: ReactNode }) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: Error) {
    this.props.onResult(this.props.endpointId, error)
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
