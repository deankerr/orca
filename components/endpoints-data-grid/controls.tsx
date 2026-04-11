import { XIcon } from 'lucide-react'
import { parseAsArrayOf, parseAsString, parseAsStringEnum, useQueryStates } from 'nuqs'

import { SearchInput } from '../shared/search-input'
import { Button } from '../ui/button'
import { AttributeFilterMenu } from './attribute-filter-menu'
import { ModalityFilterMenu } from './modality-filter-menu'
import { useEndpointFacetState } from './use-endpoint-facet-state'
import { useEndpointFocusState } from './use-endpoint-focus-state'
import { useEndpointQueryState } from './use-endpoint-query-state'
import { useEndpointSortState } from './use-endpoint-sort-state'

const endpointGridStateOptions = {
  history: 'push' as const,
  shallow: true,
}

const parseAsAttributeArray = parseAsArrayOf(parseAsString).withDefault([])

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
  const [, setParams] = useQueryStates(
    {
      q: parseAsString,
      uuid: parseAsString,
      has: parseAsAttributeArray,
      not: parseAsAttributeArray,
      sort: parseAsString,
      order: parseAsStringEnum(['asc', 'desc']),
    },
    endpointGridStateOptions,
  )

  const hasAnyFilter =
    query.hasQuery || facets.hasActiveFacets || sort.hasActiveSorting || focus.hasFocus

  const clearControls = () => {
    void setParams({
      q: null,
      uuid: null,
      has: [],
      not: [],
      sort: null,
      order: null,
    })
  }

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
