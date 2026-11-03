import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { EndpointPanel } from '#components/endpoint-panel'
import { FiltersPanel } from '#components/filters-panel'
import { ResultsPanel } from '#components/results-panel'
import { useSelectedEndpoint } from '#features/endpoints/hooks'
import { snapshotQuery } from '#features/endpoints/query'
import { endpointSearchDefaults, endpointSearchSchema } from '#features/endpoints/search'

export const Route = createFileRoute('/')({
  component: Home,
  // The whole catalogue loads in the browser; server rendering it would inline megabytes of JSON.
  loader: async ({ context }) => await context.queryClient.query(snapshotQuery),
  pendingComponent: Pending,
  search: { middlewares: [stripSearchParams(endpointSearchDefaults)] },
  ssr: false,
  validateSearch: endpointSearchSchema,
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
