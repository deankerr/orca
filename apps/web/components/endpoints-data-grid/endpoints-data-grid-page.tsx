'use client'

import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { useQuery } from '@tanstack/react-query'
import ms from 'ms'

import { EndpointsDataGrid } from './endpoints-data-grid'

export function EndpointsDataGridPage() {
  const { data: endpoints = [], isPending } = useQuery(
    convexQuery(api.endpoints.list, { maxTimeUnavailable: ms('30d'), requireTextOutput: true }),
  )
  return <EndpointsDataGrid endpoints={endpoints} isPending={isPending} />
}
