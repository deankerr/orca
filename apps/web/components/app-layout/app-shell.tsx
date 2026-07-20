import { DevBreakpointIndicator } from '@/components/dev-utils/dev-breakpoint-indicator'

import { EntityOverview, EntityOverviewProvider } from '../entity-overview/entity-overview-sheet'
import { AppHeader } from './app-header'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <EntityOverviewProvider>
      <div className="isolate flex h-dvh flex-col overflow-hidden">
        <AppHeader />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
      <EntityOverview />
      <DevBreakpointIndicator />
    </EntityOverviewProvider>
  )
}
