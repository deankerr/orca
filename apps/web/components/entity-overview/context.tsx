'use client'

import { usePathname } from 'next/navigation'
import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type OverviewEntity = { type: 'model' | 'provider'; slug: string }

type EntityOverviewContextValue = {
  entity: OverviewEntity | null
  openOverview: (entity: OverviewEntity) => void
  close: () => void
}

const EntityOverviewContext = createContext<EntityOverviewContextValue | null>(null)

export function EntityOverviewProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [entity, setEntity] = useState<OverviewEntity | null>(null)
  const [entityPath, setEntityPath] = useState(pathname)

  if (entityPath !== pathname) {
    setEntityPath(pathname)
    setEntity(null)
  }

  const value = useMemo(
    () => ({
      entity,
      openOverview: setEntity,
      close: () => {
        setEntity(null)
      },
    }),
    [entity],
  )

  return <EntityOverviewContext value={value}>{children}</EntityOverviewContext>
}

export function useEntityOverview() {
  const context = useContext(EntityOverviewContext)

  if (!context) {
    throw new Error('useEntityOverview must be used within EntityOverviewProvider')
  }

  return context
}
