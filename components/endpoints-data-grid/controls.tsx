import { XIcon } from 'lucide-react'

import { SearchInput } from '../shared/search-input'
import { Button } from '../ui/button'
import { AttributeFilterMenu } from './attribute-filter-menu'
import { ModalityFilterMenu } from './modality-filter-menu'
import { useEndpointFilters } from './use-endpoint-filters'

function EndpointsSearchInput() {
  const { globalFilter, setGlobalFilter } = useEndpointFilters()

  return (
    <SearchInput
      aria-label="Search models/providers"
      className="w-52 shrink-0"
      value={globalFilter}
      onValueChange={setGlobalFilter}
      placeholder="Search models/providers..."
    />
  )
}

export function DataGridControls() {
  const {
    highlightUuid,
    hasActiveAttributeFilters,
    hasActiveModalityFilters,
    hasActiveSorting,
    clearAllFilters,
  } = useEndpointFilters()

  const hasAnyFilter =
    hasActiveAttributeFilters || hasActiveModalityFilters || hasActiveSorting || !!highlightUuid

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-3">
      <EndpointsSearchInput />
      <ModalityFilterMenu />
      <AttributeFilterMenu />

      {hasAnyFilter && (
        <Button variant="secondary" size="sm" onClick={clearAllFilters}>
          <XIcon data-icon="inline-start" />
          Clear
        </Button>
      )}
    </div>
  )
}
