'use client'

import { useSyncExternalStore } from 'react'

// presentational features only
export function FeatureFlag({ flag, children }: { flag: string; children: React.ReactNode }) {
  const isEnabled = useSyncExternalStore(
    () => () => {},
    () => localStorage.getItem(`feature-${flag}`) === 'true',
    () => false,
  )
  return isEnabled ? <>{children}</> : null
}

// Helper to toggle flags from dev tools or anywhere
export const toggleFeature = (flag: string) => {
  if (typeof window === 'undefined' || !window.localStorage) return
  const current = localStorage.getItem(`feature-${flag}`) === 'true'
  localStorage.setItem(`feature-${flag}`, (!current).toString())
  window.location.reload() // Quick reload to apply changes
}

// Helper to check if feature is enabled (for conditional logic)
export const isFeatureEnabled = (flag: string) => {
  if (typeof window === 'undefined' || !window.localStorage) return false
  return localStorage.getItem(`feature-${flag}`) === 'true'
}

// Make it globally available
if (typeof window !== 'undefined') {
  ;(window as any).toggleFeature = toggleFeature
  ;(window as any).isFeatureEnabled = isFeatureEnabled
}
