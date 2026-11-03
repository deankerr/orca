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
      <div className="flex min-h-0 grow flex-col overflow-y-auto border-t border-border">
        <ListFacet inScope={scope.models.inScope} kind="model" selected={filters.model} />
        <ListFacet inScope={scope.providers.inScope} kind="provider" selected={filters.provider} />
        <RangeFacets />
        <PropertyFacets />
      </div>
    </aside>
  )
}
