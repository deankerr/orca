import './globals.css'
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { NuqsAdapter } from 'nuqs/adapters/next/app'

import { AppShell } from '@/components/app-layout/app-shell'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn, withEnvironmentPrefix } from '@/lib/utils'

import { ConvexClientProvider } from './convex-client-provider'

const geistSans = Geist({
  variable: '--font-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    template: withEnvironmentPrefix('ORCA ⋅ %s'),
    default: withEnvironmentPrefix('ORCA'),
  },
  description: 'Compare models and providers available on OpenRouter',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        'h-full overflow-hidden antialiased',
        geistMono.variable,
        'font-sans',
        geistSans.variable,
        'dark',
      )}
    >
      {/* Toast portals must sit above sheets and dialogs, which use z-50. */}
      <body className="h-full overflow-hidden [&_[data-slot=toast-viewport]]:z-60">
        <NuqsAdapter>
          <ConvexClientProvider>
            <TooltipProvider>
              <AppShell>{children}</AppShell>
              <Toaster />
            </TooltipProvider>
          </ConvexClientProvider>
        </NuqsAdapter>
      </body>
    </html>
  )
}
