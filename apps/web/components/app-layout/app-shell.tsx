import { DevBreakpointIndicator } from '@/components/dev-utils/dev-breakpoint-indicator'

import { EntityOverview, EntityOverviewProvider } from '../entity-overview/entity-overview-sheet'
import { AppHeader } from './app-header'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <EntityOverviewProvider>
      <div className="isolate flex h-dvh flex-col overflow-x-hidden">
        <AppHeader />

        {/* body */}
        {children}
      </div>
      <EntityOverview />
      <DevBreakpointIndicator />
    </EntityOverviewProvider>
  )
}
