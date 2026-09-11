'use client'

import { useQueryStates } from 'nuqs'
import { createContext, useContext, useMemo } from 'react'

import {
  chartModelIdFromParams,
  chartQueryPatch,
  overlayStateOptions,
  overlayStateParsers,
} from '@/lib/overlay-query-state'

const HistoryContext = createContext<{
  modelId: string | null
  openHistory: (modelId: string) => void
  close: () => void
} | null>(null)

export function PricingHistoryProvider({ children }: { children: React.ReactNode }) {
  const [params, setParams] = useQueryStates(
    {
      chart: overlayStateParsers.chart,
    },
    overlayStateOptions,
  )
  const modelId = chartModelIdFromParams(params.chart)
  const value = useMemo(
    () => ({
      modelId,
      openHistory: (nextModelId: string) => {
        void setParams(chartQueryPatch(nextModelId))
      },
      close: () => {
        void setParams(chartQueryPatch(null))
      },
    }),
    [modelId, setParams],
  )

  return <HistoryContext value={value}>{children}</HistoryContext>
}

export function usePricingHistory() {
  const context = useContext(HistoryContext)

  if (context === null) {
    throw new Error('usePricingHistory must be used within PricingHistoryProvider')
  }

  return context
}
