'use client'

import { ConvexQueryClient } from '@convex-dev/react-query'
import { api } from '@orca/backend/convex/_generated/api'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthKitProvider, useAccessToken, useAuth } from '@workos-inc/authkit-nextjs/components'
import { ConvexQueryCacheProvider } from 'convex-helpers/react/cache'
import { ConvexProviderWithAuth, ConvexReactClient, useConvexAuth, useQuery } from 'convex/react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'

import { PageLoading } from '@/components/app-layout/pages'

// One connection is reused across admin visits; the auth provider clears its token on unmount.
// oxlint-disable-next-line typescript/no-non-null-assertion -- The Convex client requires this environment variable.
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export function AdminProvider({
  initialAuth,
  children,
}: {
  initialAuth: ComponentProps<typeof AuthKitProvider>['initialAuth']
  children: ReactNode
}) {
  // oxlint-disable-next-line react/hook-use-state -- This cache is created once per admin session and never replaced.
  const [queryClient] = useState(() => {
    // Admin queries never enter the public client's persisted browser cache.
    const adapter = new ConvexQueryClient(convex)
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { queryKeyHashFn: adapter.hashFn(), queryFn: adapter.queryFn() },
      },
    })

    adapter.connect(queryClient)
    return queryClient
  })

  useEffect(
    () => () => {
      queryClient.clear()
    },
    [queryClient],
  )

  return (
    <AuthKitProvider initialAuth={initialAuth}>
      {/* oxlint-disable-next-line react/hooks -- Convex's provider API calls this custom auth hook internally. */}
      <ConvexProviderWithAuth client={convex} useAuth={useConvexAuthKit}>
        <ConvexQueryCacheProvider>
          <QueryClientProvider client={queryClient}>
            <AdminAccess>{children}</AdminAccess>
          </QueryClientProvider>
        </ConvexQueryCacheProvider>
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  )
}

function useConvexAuthKit() {
  const { user, loading } = useAuth()
  const { getAccessToken, refresh } = useAccessToken()

  return {
    isLoading: loading,
    isAuthenticated: Boolean(user),
    fetchAccessToken: async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!user) {
        return null
      }

      return (await (forceRefreshToken ? refresh() : getAccessToken())) ?? null
    },
  }
}

function AdminAccess({ children }: { children: ReactNode }): ReactNode {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const viewer = useQuery(api.admin.viewer, isAuthenticated ? {} : 'skip')

  if (isLoading || (isAuthenticated && viewer === undefined)) {
    return <PageLoading />
  }

  if (viewer?.isAdmin !== true) {
    return (
      <Link href="/sign-in" className="p-4 text-xs underline" prefetch={false}>
        Sign in to continue
      </Link>
    )
  }

  return children
}
