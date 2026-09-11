'use client'

import { useQueryStates } from 'nuqs'
import { createContext, useContext, useMemo } from 'react'

import {
  pricingHistoryModelIdFromParams,
  pricingHistoryParsers,
  pricingHistoryQueryPatch,
  pricingHistoryStateOptions,
} from './query-state'

const PricingHistoryContext = createContext<{
  modelId: string | null
  close: () => void
} | null>(null)

export function PricingHistoryProvider({ children }: { children: React.ReactNode }) {
  const [params, setParams] = useQueryStates(pricingHistoryParsers, pricingHistoryStateOptions)
  const modelId = pricingHistoryModelIdFromParams(params.pricingHistory)
  const value = useMemo(
    () => ({
      modelId,
      close: () => {
        void setParams(pricingHistoryQueryPatch(null))
      },
    }),
    [modelId, setParams],
  )

  return <PricingHistoryContext value={value}>{children}</PricingHistoryContext>
}

export function usePricingHistory() {
  const context = useContext(PricingHistoryContext)

  if (context === null) {
    throw new Error('usePricingHistory must be used within PricingHistoryProvider')
  }

  return context
}
