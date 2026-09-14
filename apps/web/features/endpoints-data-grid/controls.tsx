import { XIcon } from 'lucide-react'

import { SearchInput } from '@/components/shared/search-input'
import { Button } from '@/components/ui/button'

import { AttributeFilterMenu } from './attributes/attribute-filter-menu'
import { ModalityFilterMenu } from './attributes/modality-filter-menu'
import { useEndpointFacetState } from './attributes/use-endpoint-facet-state'
import { useEndpointFocusState } from './use-endpoint-focus-state'
import { useEndpointQueryState } from './use-endpoint-query-state'
import { useEndpointSortState } from './use-endpoint-sort-state'
import { useResetEndpointGrid } from './use-reset-endpoint-grid'

function EndpointsSearchInput() {
  const { query, setQuery } = useEndpointQueryState()

  return (
    <SearchInput
      aria-label="Search models/providers"
      className="w-52 shrink-0"
      value={query}
      onValueChange={setQuery}
      placeholder="Search models/providers..."
    />
  )
}

export function DataGridControls() {
  const focus = useEndpointFocusState()
  const facets = useEndpointFacetState()
  const query = useEndpointQueryState()
  const sort = useEndpointSortState({ hasActiveQuery: query.hasQuery })
  const clearControls = useResetEndpointGrid()

  const hasAnyFilter =
    query.hasQuery || facets.hasActiveFacets || sort.hasActiveSorting || focus.hasFocus

  return (
    <div className="flex items-center gap-2 overflow-x-auto px-3 py-3">
      <EndpointsSearchInput />
      <ModalityFilterMenu />
      <AttributeFilterMenu />

      {hasAnyFilter && (
        <Button variant="secondary" size="sm" onClick={clearControls}>
          <XIcon data-icon="inline-start" />
          Clear
        </Button>
      )}
    </div>
  )
}
