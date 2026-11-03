import { ScrollArea } from '@orca/ui/components/scroll-area'

import { HeaderBar } from '#app/header-bar'
import { useScope, useScopeSummary } from '#endpoints/hooks'

import { ListFacet } from './list-facet'
import { PropertyFacets } from './property-facets'
import { RangeFacets } from './range-facets'
import { SearchBar } from './search-bar'

export function FiltersPanel() {
  const filters = useScope()
  const scope = useScopeSummary()

  return (
    <aside
      aria-label="Filters"
      className="flex w-68 shrink-0 flex-col overflow-clip rounded-xl border border-border bg-card"
    >
      <HeaderBar />
      <SearchBar />
      <ScrollArea className="min-h-0 grow border-t border-border">
        <div className="flex flex-col">
          <ListFacet inScope={scope.models.inScope} kind="model" selected={filters.model} />
          <ListFacet
            inScope={scope.providers.inScope}
            kind="provider"
            selected={filters.provider}
          />
          <RangeFacets />
          <PropertyFacets />
        </div>
      </ScrollArea>
    </aside>
  )
}
