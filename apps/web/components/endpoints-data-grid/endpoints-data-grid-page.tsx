'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api as expApi } from '@orca/backend-experimental/convex/_generated/api'
import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from '@tanstack/react-query'
import { useQuery as useConvexQuery } from 'convex/react'
import ms from 'ms'
import { useState } from 'react'

import {
  ExpConvexClientProvider,
  isConvexExperimentalAvailable,
} from '@/app/exp-convex-client-provider'
import { useExperimentalFeatures } from '@/app/experimental-features-provider'

import { EndpointsDataGrid } from './endpoints-data-grid'

function ProductionEndpointsDataGrid() {
  const { data: endpoints = [], isPending } = useQuery(
    convexQuery(api.endpoints.list, { maxTimeUnavailable: ms('30d') }),
  )
  return <EndpointsDataGrid endpoints={endpoints} isPending={isPending} />
}

function ExperimentalEndpointsDataGrid() {
  const [unavailableSince] = useState(() => Date.now() - ms('30d'))
  const data = useConvexQuery(expApi.compat.endpoints.list, { unavailableSince })

  return <EndpointsDataGrid endpoints={data ?? []} isPending={data === undefined} />
}

export function EndpointsDataGridPage() {
  const { enabled: experimentalFeaturesEnabled } = useExperimentalFeatures()

  if (experimentalFeaturesEnabled && isConvexExperimentalAvailable) {
    return (
      <ExpConvexClientProvider>
        <ExperimentalEndpointsDataGrid />
      </ExpConvexClientProvider>
    )
  }

  return <ProductionEndpointsDataGrid />
}
