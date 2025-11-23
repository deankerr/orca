import './globals.css'

import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { NuqsAdapter } from 'nuqs/adapters/next/app'

import { AppShell } from '@/components/app-layout/app-shell'
import { withEnvironmentPrefix } from '@/lib/utils'

import { ConvexClientProvider } from './convex-client-provider'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    template: withEnvironmentPrefix('%s - ORCA'),
    default: withEnvironmentPrefix('ORCA'),
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
            <AppShell>{children}</AppShell>
          </ConvexClientProvider>
        </NuqsAdapter>
      </body>
    </html>
  )
}
