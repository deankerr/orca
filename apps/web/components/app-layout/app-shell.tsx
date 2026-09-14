import { Suspense } from 'react'

import { DevBreakpointIndicator } from '@/components/dev-utils/dev-breakpoint-indicator'
import { EntityOverviewProvider } from '@/features/entity-overview/context'
import { EntityOverviewSheet } from '@/features/entity-overview/sheet'
import { PricingHistoryProvider } from '@/features/pricing-history/context'
import { PricingHistoryOverlay } from '@/features/pricing-history/overlay'

import { AppHeader } from './app-header'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <EntityOverviewProvider>
      <div className="isolate flex h-dvh flex-col overflow-hidden">
        <AppHeader />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
      <EntityOverviewSheet />
      <DevBreakpointIndicator />
      <Suspense>
        <PricingHistoryProvider>
          <PricingHistoryOverlay />
        </PricingHistoryProvider>
      </Suspense>
    </EntityOverviewProvider>
  )
}
