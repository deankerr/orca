import { ScopeBar } from '#components/scope-bar'
import { StatusBar } from '#components/status-bar'

import { PlotRegion } from '../features/plot/price-plot'
import { EndpointTable } from '../features/table/endpoint-table'

export function ResultsPanel() {
  return (
    <section
      aria-label="Results"
      data-table-keys=""
      className="flex min-w-0 grow basis-0 flex-col overflow-clip rounded-xl border border-border bg-background"
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
