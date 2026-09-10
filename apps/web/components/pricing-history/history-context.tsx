'use client'

import { createContext, useContext, useState, useMemo } from 'react'

type Model = { modelId: string; name: string }
const HistoryContext = createContext<{
  model: Model | null
  openHistory: (model: Model) => void
  close: () => void
} | null>(null)

export function PricingHistoryProvider({ children }: { children: React.ReactNode }) {
  const [model, setModel] = useState<Model | null>(null)

  const value = useMemo(
    () => ({
      model,
      openHistory: setModel,
      close: () => {
        setModel(null)
      },
    }),
    [model],
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
