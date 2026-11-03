import { ScopeBar } from '#components/scope-bar'
import { StatusBar } from '#components/status-bar'

import { EndpointTable } from '../features/table/endpoint-table'

function PlotPlaceholder() {
  return (
    <div className="flex shrink-0 flex-col gap-1 px-5 pb-2.5">
      <div className="flex justify-between font-mono text-[10px] leading-3.5 text-muted-foreground">
        <span className="tracking-[0.04em] uppercase">Blend 3:1 $/M × tok/s p50 · log scales</span>
        <span>↖ cheaper and faster</span>
      </div>
      <div className="grid h-28 grid-cols-4 grid-rows-2 border border-border-solid">
        {Array.from({ length: 8 }, (_, cell) => (
          <div className="border-r border-b border-border-solid last:border-r-0" key={cell} />
        ))}
      </div>
      <div className="flex justify-between font-mono text-[10px] leading-3.5 text-muted-foreground">
        {['$0.01', '$0.10', '$1', '$10', '$100'].map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  )
}

export function ResultsPanel() {
  return (
    <section
      aria-label="Results"
      className="flex min-w-0 grow basis-0 flex-col overflow-clip rounded-xl border border-border bg-background"
    >
      <ScopeBar />
      <PlotPlaceholder />
      <section aria-label="Results table" className="min-h-0 grow overflow-auto">
        <EndpointTable />
      </section>
      <StatusBar />
    </section>
  )
}
