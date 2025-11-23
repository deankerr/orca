import './globals.css'

import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { NuqsAdapter } from 'nuqs/adapters/next/app'

import { App } from '@/components/app-layout/app'
import { DevBreakpointIndicator } from '@/components/dev-utils/dev-breakpoint-indicator'
import { Toaster } from '@/components/ui/sonner'

import { ConvexClientProvider } from './convex-client-provider'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Determine environment emoji prefix
const getEnvironmentPrefix = () => {
  if (process.env.NODE_ENV === 'development') {
    return '🚧 '
  }
  if (process.env.VERCEL_ENV === 'preview') {
    return '🔍 '
  }
  return '' // Production - no emoji
}

const envPrefix = getEnvironmentPrefix()

export const metadata: Metadata = {
  title: {
    template: `${envPrefix}%s - ORCA`,
    default: `${envPrefix}ORCA`,
  },
  description: 'ORCA: OpenRouter Capability Analysis',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      {process.env.NODE_ENV === 'development' && (
        <head>
          <script async crossOrigin="anonymous" src="https://tweakcn.com/live-preview.min.js" />
        </head>
      )}
      <body className={`${geistSans.variable} ${geistMono.variable} dark font-sans antialiased`}>
        <NuqsAdapter>
          <ConvexClientProvider>
            <App>{children}</App>
          </ConvexClientProvider>
        </NuqsAdapter>
        <Toaster position="top-center" />
        <DevBreakpointIndicator />
      </body>
    </html>
  )
}
