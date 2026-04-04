import { DevBreakpointIndicator } from '@/components/dev-utils/dev-breakpoint-indicator'

import { EntitySheet, EntitySheetProvider } from '../entity-sheet/entity-sheet'
import { AppHeader } from './app-header'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <EntitySheetProvider>
      <div className="isolate flex h-screen flex-col overflow-x-hidden">
        <AppHeader />

        {/* body */}
        {children}
      </div>
      <EntitySheet />
      <DevBreakpointIndicator />
    </EntitySheetProvider>
  )
}
