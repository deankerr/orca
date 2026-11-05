import { ScrollArea } from '@orca/ui/components/scroll-area'
import type { ReactNode } from 'react'

import { RESULTS_REGION_ID } from '#app/keyboard'
import { StatusBar } from '#app/status-bar'
import { PlotRegion } from '#panels/results/plot/price-plot'
import { EndpointTable } from '#panels/results/table/endpoint-table'

import { ScopeBar } from './scope-bar'

/** The Results panel's frame, which the loading skeleton fills with placeholders. */
export function ResultsFrame({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Results"
      data-table-keys=""
      className="flex min-w-0 grow basis-0 flex-col overflow-clip rounded-xl border border-border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      // Not a tab stop: it only takes focus from code, when a closing panel's row has been filtered out.
      id={RESULTS_REGION_ID}
      tabIndex={-1}
    >
      {children}
    </section>
  )
}

export function ResultsPanel() {
  return (
    <ResultsFrame>
      <ScopeBar />
      <PlotRegion />
      {/* The sticky header lives in this viewport, which never bounces, so the header holds still. */}
      <ScrollArea
        className="min-h-0 grow"
        horizontal
        render={<section aria-label="Results table" />}
      >
        <EndpointTable />
      </ScrollArea>
      <StatusBar />
    </ResultsFrame>
  )
}
