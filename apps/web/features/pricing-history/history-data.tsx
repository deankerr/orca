import { api } from '@orca/backend/api'
import { useQuery } from 'convex/react'
import type { ReactNode } from 'react'

import { Spinner } from '@/components/ui/spinner'

import type { PricingHistory } from './data'

/** Subscribe together; the chart applies the independent clock to both complete histories. */
export function HistoryData({
  modelId,
  children,
}: {
  modelId: string
  children: (history: PricingHistory | null) => ReactNode
}): ReactNode {
  const observations = useQuery(api.products.pricing_history.query.observations, {
    model_id: modelId,
  })

  const prices = useQuery(api.products.pricing_history.query.prices, { model_id: modelId })
  const asOf = useQuery(api.products.shared.clock.observe)

  if (observations === undefined || prices === undefined || asOf === undefined) {
    return <HistoryLoading />
  }

  if (asOf === null) {
    return children(null)
  }

  const pricesByEndpoint = new Map(prices.map((endpoint) => [endpoint.id, endpoint.prices]))

  return children({
    asOf: Date.parse(asOf),
    endpoints: observations.map((endpoint) => ({
      ...endpoint,
      prices: pricesByEndpoint.get(endpoint.id) ?? [],
    })),
    modelId,
  })
}

function HistoryLoading() {
  return (
    <output aria-live="polite" className="flex items-center justify-center gap-2 py-8">
      <Spinner />
      Loading pricing history…
    </output>
  )
}
