import { TooltipProvider } from '@orca/ui/components/tooltip'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import type { ReactNode } from 'react'

import { ThemeProvider } from '#app/theme-provider'

import appCss from '@orca/ui/globals.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    links: [
      { href: '/favicon.svg', rel: 'icon', type: 'image/svg+xml' },
      { href: appCss, rel: 'stylesheet' },
    ],
    meta: [
      { charSet: 'utf-8' },
      { content: 'width=device-width, initial-scale=1, viewport-fit=cover', name: 'viewport' },
      { title: 'ORCA' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html className="dark" lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <TanStackDevtools
            config={{ hideUntilHover: true, position: 'bottom-left', triggerMode: 'fixed' }}
            plugins={[{ name: 'TanStack Router', render: <TanStackRouterDevtoolsPanel /> }]}
          />
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
