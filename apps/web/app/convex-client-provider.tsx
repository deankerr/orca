'use client'

import { ConvexQueryClient } from '@convex-dev/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { ConvexQueryCacheProvider } from 'convex-helpers/react/cache'
import { ConvexProvider, ConvexReactClient } from 'convex/react'
import { makeFunctionReference } from 'convex/server'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { useKeys } from 'rooks'
import { z } from 'zod'

import { readinessQueryTimings } from '@/features/product-readiness/query-timing'
import { appVersion } from '@/lib/app-version'

// oxlint-disable-next-line typescript/no-non-null-assertion -- The Convex client requires this environment variable.
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

/*
  @convex-dev/react-query
  - client adapter
  - supports many react-query features like Suspense
  - doesn't support convex paginated queries!
  - use is optional, the regular client still works
  - staleTime, retry, refetch etc. are ignored - convex reactive queries are always up to date
*/
const convexQueryClient = new ConvexQueryClient(convex)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      queryFn: convexQueryClient.queryFn(),
      queryKeyHashFn: convexQueryClient.hashFn(),
    },
  },
})

if (typeof window !== 'undefined') {
  let observingConnection = false

  readinessQueryTimings.observe(
    queryClient.getQueryCache(),
    (key) => {
      // Only public queries used by measured product views reach this observer.
      const reference = makeFunctionReference<'query'>(String(key[1]))
      const args = z.record(z.string(), z.string()).parse(key[2])

      try {
        return convex.watchQuery(reference, args).localQueryResult() !== undefined
      } catch {
        // A cached query error is not a cached successful result.
        return false
      }
    },
    () => {
      if (observingConnection) {
        return
      }

      observingConnection = true
      // Subscribe when a measured query is added, not earlier just to gather telemetry.
      readinessQueryTimings.connection.update(convex.connectionState())
      convex.subscribeToConnectionState((state) => {
        readinessQueryTimings.connection.update(state)
      })
    },
  )
}

convexQueryClient.connect(queryClient)

const browserStorage = typeof window === 'undefined' ? undefined : window.localStorage

const asyncStoragePersister = createAsyncStoragePersister({
  key: 'ORCA_QUERY_CACHE',
  storage: browserStorage,
})

const persister = {
  ...asyncStoragePersister,
  restoreClient: async () => {
    const restored = await asyncStoragePersister.restoreClient()
    readinessQueryTimings.markRestored(
      restored?.clientState.queries.map((query) => query.queryHash) ?? [],
    )

    return restored
  },
}

// Persisted queries hydrate from storage and refresh; gcTime must cover the default 24h maxAge.

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [showDevtools, setShowDevtools] = useState(false)
  useKeys(['ControlLeft', 'KeyT'], () => {
    setShowDevtools((show) => !show)
  })

  return (
    <ConvexProvider client={convex}>
      <ConvexQueryCacheProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            // Discard queries from older builds before hydration starts Convex subscriptions.
            buster: appVersion,
            persister,
          }}
        >
          {children}
          {showDevtools && <ReactQueryDevtools />}
        </PersistQueryClientProvider>
      </ConvexQueryCacheProvider>
    </ConvexProvider>
  )
}
