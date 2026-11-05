import { ScrollArea } from '@orca/ui/components/scroll-area'

import { HeaderBar } from '#app/header-bar'
import { useScope } from '#endpoints/hooks'

import { ListFacet } from './list-facet'
import { PropertyFacets } from './property-facets'
import { RangeFacets } from './range-facets'

export function FiltersPanel() {
  const filters = useScope()

  return (
    <aside
      aria-label="Filters"
      className="flex w-68 shrink-0 flex-col overflow-clip rounded-xl border border-border bg-card"
    >
      <HeaderBar />
      <ScrollArea className="min-h-0 grow border-t border-border">
        <div className="flex flex-col">
          <ListFacet kind="model" selected={filters.model} />
          <ListFacet kind="provider" selected={filters.provider} />
          <RangeFacets />
          <PropertyFacets />
        </div>
      </ScrollArea>
    </aside>
  )
}
