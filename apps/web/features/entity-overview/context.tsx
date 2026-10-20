'use client'

import { useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { startReadiness } from '@/features/product-readiness/measurement'
import type { ReadinessMeasurement } from '@/features/product-readiness/measurement'

import { modelOverviewQuery, providerOverviewQuery } from './query-options'

type OverviewEntity = { type: 'model' | 'provider'; slug: string }

export type OverviewRequest = OverviewEntity & {
  measurement: ReadinessMeasurement
}

type EntityOverviewContextValue = {
  entity: OverviewRequest | null
  openOverview: (entity: OverviewEntity) => void
  close: () => void
}

const EntityOverviewContext = createContext<EntityOverviewContextValue | null>(null)

export function EntityOverviewProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const client = useQueryClient()
  const [entity, setEntity] = useState<OverviewRequest | null>(null)
  const [entityPath, setEntityPath] = useState(pathname)

  if (entityPath !== pathname) {
    setEntityPath(pathname)
    setEntity(null)
  }

  const value = useMemo(
    () => ({
      entity,
      openOverview: (target: OverviewEntity) => {
        const options =
          target.type === 'model'
            ? modelOverviewQuery(target.slug)
            : providerOverviewQuery(target.slug)

        setEntity({
          ...target,
          measurement: startReadiness(client, options.queryKey, 'overview_sheet'),
        })
      },
      close: () => {
        setEntity(null)
      },
    }),
    [entity, client],
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
