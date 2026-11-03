import { ConvexQueryClient } from '@convex-dev/react-query'
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { ConvexProvider } from 'convex/react'

import { stringifySearch } from '#lib/search'

import { routeTree } from './routeTree.gen'

export function getRouter() {
  const url = import.meta.env.VITE_CONVEX_URL

  if (url === undefined || url === '') {
    throw new Error('Set VITE_CONVEX_URL in apps/start/.env.local')
  }

  const convex = new ConvexQueryClient(url)

  const queryClient = new QueryClient({
    defaultOptions: { queries: { queryFn: convex.queryFn(), queryKeyHashFn: convex.hashFn() } },
  })

  convex.connect(queryClient)

  const router = createRouter({
    Wrap: ({ children }) => (
      <ConvexProvider client={convex.convexClient}>{children}</ConvexProvider>
    ),
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true,
    stringifySearch,
  })

  setupRouterSsrQueryIntegration({ queryClient, router })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
