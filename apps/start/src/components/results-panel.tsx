import { ScopeBar } from '#components/scope-bar'
import { StatusBar } from '#components/status-bar'

import { PlotRegion } from '../features/plot/price-plot'
import { EndpointTable } from '../features/table/endpoint-table'
import { RESULTS_REGION_ID } from '../features/table/focus'

export function ResultsPanel() {
  return (
    <section
      aria-label="Results"
      data-table-keys=""
      className="flex min-w-0 grow basis-0 flex-col overflow-clip rounded-xl border border-border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      // Not a tab stop: it only takes focus from code, when a closing panel's row has been filtered out.
      id={RESULTS_REGION_ID}
      tabIndex={-1}
    >
      <ScopeBar />
      <PlotRegion />
      <section aria-label="Results table" className="min-h-0 grow overflow-auto">
        <EndpointTable />
      </section>
      <StatusBar />
    </section>
  )
}
