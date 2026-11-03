import { HeaderBar } from '#components/header-bar'
import { ListFacet } from '#components/list-facet'
import { PropertyFacets } from '#components/property-facets'
import { RangeFacets } from '#components/range-facets'
import { SearchBar } from '#components/search-bar'
import { useEndpointSearch, useScopeSummary } from '#features/endpoints/hooks'

export function FiltersPanel() {
  const filters = useEndpointSearch()
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
