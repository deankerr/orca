'use client'

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

type EntityState = { type: 'model'; slug: string } | { type: 'provider'; slug: string } | null

type EntitySheetContextValue = {
  entity: EntityState
  openModel: (slug: string) => void
  openProvider: (slug: string) => void
  close: () => void
}

const EntitySheetContext = createContext<EntitySheetContextValue | null>(null)

export function EntitySheetProvider({ children }: { children: ReactNode }) {
  const [entity, setEntity] = useState<EntityState>(null)

  return (
    <EntitySheetContext.Provider
      value={{
        entity,
        openModel: (slug) => {
          setEntity({ type: 'model', slug })
        },
        openProvider: (slug) => {
          setEntity({ type: 'provider', slug })
        },
        close: () => {
          setEntity(null)
        },
      }}
    >
      {children}
    </EntitySheetContext.Provider>
  )
}

export function useEntitySheet() {
  const context = useContext(EntitySheetContext)
  if (!context) {
    throw new Error('useEntitySheet must be used within EntitySheetProvider')
  }

  return context
}
