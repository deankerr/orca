'use client'

import { api } from '@orca/backend-experimental/convex/_generated/api'
import { ConvexProvider, ConvexReactClient, useQuery } from 'convex/react'
import ms from 'ms'
import { useState } from 'react'
import type { ReactNode } from 'react'

function createExpConvexClient() {
  try {
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const url = process.env.NEXT_PUBLIC_CONVEX_EXP_URL!

    return new ConvexReactClient(url)
  } catch (error) {
    console.error('Failed to create experimental Convex client', error)
    return null
  }
}

const convex = createExpConvexClient()
export const expConvexAvailable = convex !== null

export function ExpConvexClientProvider({ children }: { children: ReactNode }) {
  if (convex === null) {
    return <>{children}</>
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>
}

export function useExpEndpointsList() {
  const [unavailableSince] = useState(() => Date.now() - ms('30d'))
  const data = useQuery(api.compat.endpoints.list, { unavailableSince })

  return {
    data,
    isPending: data === undefined,
  }
}
