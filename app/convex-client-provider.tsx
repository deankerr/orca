'use client'

import { useState, type ReactNode } from 'react'

import { ConvexQueryCacheProvider } from 'convex-helpers/react/cache/provider'
import { ConvexProvider, ConvexReactClient } from 'convex/react'

import { ConvexQueryClient } from '@convex-dev/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { useKeys } from 'rooks'

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
      queryKeyHashFn: convexQueryClient.hashFn(),
      queryFn: convexQueryClient.queryFn(),
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
})
convexQueryClient.connect(queryClient)

const asyncStoragePersister = createAsyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'ORCA_QUERY_CACHE',
})

/* 
  These layers are independent, and not interact.

  ConvexQueryCacheProvider 
  - standard convex queries only (inc. paginated queries)
  - persists unsubscribed queries for 5 minutes (default)
  - session cache only, does not survive page refresh

  PersistQueryClientProvider 
  - tanstack react query adapter
  - persists data to storage for 24 hours (default)
  - hydrates and refreshes
  - gcTime must be equal or greater than maxAge
  - doesn't support convex paginated queries!
*/

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [showDevtools, setShowDevtools] = useState(false)
  useKeys(['ControlLeft', 'KeyT'], () => setShowDevtools((show) => !show))

  return (
    <ConvexProvider client={convex}>
      <ConvexQueryCacheProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: asyncStoragePersister,
          }}
        >
          {children}
          {showDevtools && <ReactQueryDevtools />}
        </PersistQueryClientProvider>
      </ConvexQueryCacheProvider>
    </ConvexProvider>
  )
}
