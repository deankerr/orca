import './globals.css'
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { NuqsAdapter } from 'nuqs/adapters/next/app'

import { AppShell } from '@/components/app-layout/app-shell'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn, withEnvironmentPrefix } from '@/lib/utils'

import { ConvexClientProvider } from './convex-client-provider'
import { ExperimentalFeaturesProvider } from './experimental-features-provider'

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
      <body className="h-full overflow-hidden">
        <NuqsAdapter>
          <ConvexClientProvider>
            <TooltipProvider>
              <ExperimentalFeaturesProvider>
                <AppShell>{children}</AppShell>
              </ExperimentalFeaturesProvider>
              <Toaster position="top-center" theme="dark" />
            </TooltipProvider>
          </ConvexClientProvider>
        </NuqsAdapter>
      </body>
    </html>
  )
}
