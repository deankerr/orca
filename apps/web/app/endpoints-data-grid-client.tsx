'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from '@tanstack/react-query'
import ms from 'ms'
import { useState } from 'react'
import { useKeys } from 'rooks'

import { EndpointsDataGrid } from '@/components/endpoints-data-grid/endpoints-data-grid-page'

import {
  ExpConvexClientProvider,
  expConvexAvailable,
  useExpEndpointsList,
} from './exp-convex-client-provider'

function ProductionEndpointsDataGrid() {
  const { data: endpoints = [], isPending } = useQuery(
    convexQuery(api.endpoints.list, { maxTimeUnavailable: ms('30d') }),
  )
  return <EndpointsDataGrid endpoints={endpoints} isPending={isPending} />
}

function ExperimentalEndpointsDataGrid() {
  const { data = [], isPending } = useExpEndpointsList()
  return <EndpointsDataGrid endpoints={data} isPending={isPending} />
}

export function EndpointsDataGridClient() {
  const [expBackendEnabled, setExpBackendEnabled] = useState(false)

  useKeys(['ControlLeft', 'KeyE'], () => {
    if (!expConvexAvailable) {
      return
    }

    setExpBackendEnabled((enabled) => !enabled)
  })

  if (expBackendEnabled) {
    return (
      <ExpConvexClientProvider>
        <ExperimentalEndpointsDataGrid />
        <div className="absolute top-1 right-1">exp</div>
      </ExpConvexClientProvider>
    )
  }

  return <ProductionEndpointsDataGrid />
}
