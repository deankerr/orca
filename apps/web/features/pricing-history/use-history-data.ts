import { convexQuery, useConvex } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useQueries, useQuery } from '@tanstack/react-query'

import { loadEndpointPrices, modelEndpoints } from './data'
import type { PricingHistory } from './data'

export function useHistoryData(modelId: string) {
  const convex = useConvex()
  const listings = useQuery(convexQuery(api.v4.history.listings.query.lens, {}))
  const cutoff = listings.data?.as_of ?? null
  const endpoints = modelEndpoints(listings.data?.rows ?? [], modelId)
  const prices = useQueries({
    queries:
      cutoff === null
        ? []
        : endpoints.map(({ id }) => ({
            queryKey: ['pricing-history:v4', id, cutoff],
            queryFn: async ({ signal }: { signal: AbortSignal }) =>
              await loadEndpointPrices(
                async (args) => {
                  signal.throwIfAborted()
                  return await convex.query(api.v4.history.pricing.query.list, args)
                },
                id,
                cutoff,
              ),
          })),
  })

  const data: PricingHistory = {
    modelId,
    asOf: cutoff === null ? 0 : Date.parse(cutoff),
    endpoints: endpoints.map((endpoint, index) => ({
      ...endpoint,
      prices: prices[index]?.data ?? [],
    })),
  }

  return {
    data,
    isPending: listings.isPending || prices.some((result) => result.isPending),
    error: listings.error ?? prices.find((result) => result.error)?.error,
    refetch: async () =>
      await Promise.all([
        listings.refetch(),
        ...prices.map(async (result) => await result.refetch()),
      ]),
  }
}
