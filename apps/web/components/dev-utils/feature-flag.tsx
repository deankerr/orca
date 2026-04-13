'use client'

import { useSyncExternalStore } from 'react'

const unsubscribe = () => null
const subscribe = () => unsubscribe

declare global {
  interface Window {
    toggleFeature: typeof toggleFeature
    isFeatureEnabled: typeof isFeatureEnabled
  }
}

// presentational features only
export function FeatureFlag({
  flag,
  children,
}: {
  flag: string
  children: React.ReactNode
}): React.ReactNode {
  const isEnabled = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(`feature-${flag}`) === 'true',
    () => false,
  )
  return isEnabled ? children : null
}

// Helper to toggle flags from dev tools or anywhere
export const toggleFeature = (flag: string) => {
  if (typeof window === 'undefined') {
    return
  }
  const current = localStorage.getItem(`feature-${flag}`) === 'true'
  localStorage.setItem(`feature-${flag}`, (!current).toString())
  window.location.reload() // Quick reload to apply changes
}

// Helper to check if feature is enabled (for conditional logic)
export const isFeatureEnabled = (flag: string) => {
  if (typeof window === 'undefined') {
    return false
  }
  return localStorage.getItem(`feature-${flag}`) === 'true'
}

// Make it globally available
if (typeof window !== 'undefined') {
  window.toggleFeature = toggleFeature
  window.isFeatureEnabled = isFeatureEnabled
}
