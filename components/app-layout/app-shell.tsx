import { DevBreakpointIndicator } from '@/components/dev-utils/dev-breakpoint-indicator'
import { Toaster } from '@/components/ui/sonner'

import { EntitySheet, EntitySheetProvider } from '../entity-sheet/entity-sheet'
import { TooltipProvider } from '../ui/tooltip'
import { AppHeader } from './app-header'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <EntitySheetProvider>
        <div className="isolate flex h-screen flex-col overflow-x-hidden">
          <AppHeader />

          {/* body */}
          {children}
        </div>

        <EntitySheet />
        <Toaster position="top-center" />
        <DevBreakpointIndicator />
      </EntitySheetProvider>
    </TooltipProvider>
  )
}
