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
      value={globalFilter}
      onValueChange={setGlobalFilter}
      label="Search models/providers..."
      placeholder="Search models/providers..."
      hideLabel
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
    <div className="flex items-center gap-1.5 px-3 py-3">
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
