import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { useSelectedEndpoint } from '#endpoints/hooks'
import { scopeDefaults, scopeSchema } from '#endpoints/scope'
import { snapshotQuery } from '#endpoints/snapshot'
import { EndpointPanel } from '#panels/endpoint/endpoint-panel'
import { FiltersPanel } from '#panels/filters/filters-panel'
import { ResultsPanel } from '#panels/results/results-panel'

export const Route = createFileRoute('/')({
  component: Home,
  // The whole catalogue loads in the browser; server rendering it would inline megabytes of JSON.
  loader: async ({ context }) => await context.queryClient.query(snapshotQuery),
  pendingComponent: Pending,
  search: { middlewares: [stripSearchParams(scopeDefaults)] },
  ssr: false,
  validateSearch: scopeSchema,
})

function Pending() {
  return (
    <main className="flex h-svh items-center justify-center bg-background font-mono text-xs text-muted-foreground">
      Loading catalogue…
    </main>
  )
}

function Home() {
  // With nothing selected the panel is gone and the Results panel takes its width.
  const selected = useSelectedEndpoint()

  return (
    <main className="flex h-svh gap-2 bg-background p-2">
      <FiltersPanel />
      <ResultsPanel />
      {selected === null ? null : <EndpointPanel row={selected} />}
    </main>
  )
}
