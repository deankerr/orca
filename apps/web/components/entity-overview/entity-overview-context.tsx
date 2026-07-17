'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type EntityState = { type: 'model' | 'provider'; slug: string } | null

type EntityOverviewContextValue = {
  entity: EntityState
  openOverview: (entity: { type: 'model' | 'provider'; slug: string }) => void
  close: () => void
}

const EntityOverviewContext = createContext<EntityOverviewContextValue | null>(null)

export function EntityOverviewProvider({ children }: { children: ReactNode }) {
  const [entity, setEntity] = useState<EntityState>(null)
  const openOverview = useCallback((next: NonNullable<EntityState>) => {
    setEntity(next)
  }, [])
  const close = useCallback(() => {
    setEntity(null)
  }, [])
  const value = useMemo(
    () => ({
      entity,
      openOverview,
      close,
    }),
    [entity, openOverview, close],
  )

  return <EntityOverviewContext.Provider value={value}>{children}</EntityOverviewContext.Provider>
}

export function useEntityOverview() {
  const context = useContext(EntityOverviewContext)
  if (!context) {
    throw new Error('useEntityOverview must be used within EntityOverviewProvider')
  }
  return context
}
