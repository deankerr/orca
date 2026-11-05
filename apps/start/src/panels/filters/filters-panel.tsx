import { ScrollArea } from '@orca/ui/components/scroll-area'
import type { ReactNode } from 'react'

import { HeaderBar } from '#app/header-bar'
import { useScopeFilters } from '#endpoints/hooks'

import { ListFacet } from './list-facet'
import { PropertyFacets } from './property-facets'
import { RangeFacets } from './range-facets'

/** The Filters panel's frame, which the loading skeleton fills with placeholders. */
export function FiltersFrame({ children }: { children: ReactNode }) {
  return (
    <aside
      aria-label="Filters"
      className="flex w-68 shrink-0 flex-col overflow-clip rounded-xl border border-border bg-card"
    >
      <HeaderBar />
      <ScrollArea className="min-h-0 grow border-t border-border">
        <div className="flex flex-col">{children}</div>
      </ScrollArea>
    </aside>
  )
}

export function FiltersPanel() {
  const { model, provider } = useScopeFilters()

  return (
    <FiltersFrame>
      <ListFacet kind="model" selected={model} />
      <ListFacet kind="provider" selected={provider} />
      <RangeFacets />
      <PropertyFacets />
    </FiltersFrame>
  )
}
