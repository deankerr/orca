'use client'

import { createContext, use, useState } from 'react'
import type { ReactNode } from 'react'
import { useKeys } from 'rooks'

const ExperimentalFeaturesContext = createContext<{
  enabled: boolean
} | null>(null)

export function ExperimentalFeaturesProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false)

  useKeys(['ControlLeft', 'KeyE'], () => {
    setEnabled((current) => !current)
  })

  return (
    <ExperimentalFeaturesContext value={{ enabled }}>
      {children}
      {enabled && <div className="absolute top-1 right-1">E</div>}
    </ExperimentalFeaturesContext>
  )
}

export function useExperimentalFeatures() {
  const features = use(ExperimentalFeaturesContext)

  if (features === null) {
    throw new Error('useExperimentalFeatures must be used within ExperimentalFeaturesProvider')
  }

  return features
}
