import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { useState } from 'react'

import { AppLayout } from '#app/app-layout'
import { useFiltersCollapsed } from '#app/filters-preference'
import { drawerClosesEndpoint } from '#app/keyboard'
import type { EndpointSide } from '#app/panel-layout'
import {
  DockedFilters,
  OpenFiltersContext,
  PanelDrawer,
  usePanelLayout,
  useDrawerSession,
} from '#app/panels'
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

// The server sends this as the page, so it holds nothing that depends on the browser's width. The
// Filters preference is a cookie, which the server reads.
function Pending() {
  return (
    <AppLayout busy>
      <DockedFilters collapsed={useFiltersCollapsed()}>
        <FiltersSkeleton />
      </DockedFilters>
      <ResultsSkeleton />
      <output className="sr-only">Loading catalogue…</output>
    </AppLayout>
  )
}

/**
 * The selected endpoint in a drawer that floats over Results, so selecting never reflows the Table.
 * Beside the Table it is non-modal: the Table keeps focus, ↑/↓ and clicks on rows move the selection,
 * and the drawer follows. From the bottom, on a phone, it is modal and swipes down to close.
 */
function EndpointDrawer({ side }: { side: EndpointSide }) {
  const selected = useSelectedEndpoint()
  const { selectEndpoint } = useScopeActions()
  // The drawer slides away showing the endpoint it closed on: the last one selected, kept until
  // another replaces it.
  const [shown, setShown] = useState(selected)

  if (selected !== null && selected !== shown) {
    setShown(selected)
  }

  const row = selected ?? shown
  const modal = side === 'bottom'

  if (row === null) {
    return null
  }

  return (
    <PanelDrawer
      label="Endpoint"
      modal={modal}
      onOpenChange={(open, reason) => {
        if (!open && drawerClosesEndpoint(reason, modal)) {
          selectEndpoint(undefined)
        }
      }}
      open={selected !== null}
      side={side}
    >
      <EndpointPanel row={row} />
    </PanelDrawer>
  )
}

function Home() {
  const layout = usePanelLayout()
  const filtersDrawer = useDrawerSession(layout.filters)

  return (
    <AppLayout>
      {layout.filters === 'drawer' ? (
        <PanelDrawer
          label="Filters"
          modal
          onOpenChange={filtersDrawer.setOpen}
          open={filtersDrawer.open}
          side="left"
        >
          <FiltersPanel />
        </PanelDrawer>
      ) : (
        <DockedFilters collapsed={layout.filters === 'collapsed'}>
          <FiltersPanel />
        </DockedFilters>
      )}
      <OpenFiltersContext
        value={() => {
          filtersDrawer.setOpen(true)
        }}
      >
        <ResultsPanel />
      </OpenFiltersContext>
      <EndpointDrawer side={layout.endpoint} />
    </AppLayout>
  )
}
