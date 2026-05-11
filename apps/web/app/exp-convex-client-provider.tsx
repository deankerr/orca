'use client'

import { ConvexProvider, ConvexReactClient } from 'convex/react'
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
export const isConvexExperimentalAvailable = convex !== null

export function ExpConvexClientProvider({ children }: { children: ReactNode }) {
  if (convex === null) {
    return <>{children}</>
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>
}
