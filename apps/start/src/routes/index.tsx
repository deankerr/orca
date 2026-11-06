import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { AppLayout } from '#app/app-layout'
import { PanelSlot, setFiltersSheetOpen, useFiltersSheetOpen, usePanelLayout } from '#app/panels'
import { useScopeActions, useSelectedEndpoint } from '#endpoints/hooks'
import { scopeDefaults, scopeSchema } from '#endpoints/scope'
import { snapshotQuery } from '#endpoints/snapshot'
import { EndpointPanel } from '#panels/endpoint/endpoint-panel'
import { FiltersPanel } from '#panels/filters/filters-panel'
import { FiltersSkeleton } from '#panels/filters/filters-skeleton'
import { ResultsPanel } from '#panels/results/results-panel'
import { ResultsSkeleton } from '#panels/results/results-skeleton'

export const Route = createFileRoute('/')({
  component: Home,
  // The whole catalogue loads in the browser; server rendering it would inline megabytes of JSON.
  loader: async ({ context }) => await context.queryClient.query(snapshotQuery),
  pendingComponent: Pending,
  search: { middlewares: [stripSearchParams(scopeDefaults)] },
  ssr: false,
  validateSearch: scopeSchema,
})

// The server sends this as the page, so it holds nothing that depends on the browser.
function Pending() {
  return (
    <AppLayout busy>
      <FiltersSkeleton />
      <ResultsSkeleton />
      <output className="sr-only">Loading catalogue…</output>
    </AppLayout>
  )
}

function Home() {
  // With nothing selected the panel is gone and the Results panel takes its width.
  const selected = useSelectedEndpoint()
  const layout = usePanelLayout()
  const filtersOpen = useFiltersSheetOpen()
  const { selectEndpoint } = useScopeActions()

  return (
    <AppLayout>
      <PanelSlot
        label="Filters"
        onClose={() => {
          setFiltersSheetOpen(false)
        }}
        open={filtersOpen}
        placement={layout.filters}
        side="left"
      >
        <FiltersPanel />
      </PanelSlot>
      <ResultsPanel />
      {selected === null ? null : (
        // A sheet is open exactly while an endpoint is selected; closing it clears the selection.
        <PanelSlot
          label="Endpoint"
          onClose={() => {
            selectEndpoint(undefined)
          }}
          open
          placement={layout.endpoint}
          side="bottom"
        >
          <EndpointPanel row={selected} />
        </PanelSlot>
      )}
    </AppLayout>
  )
}
