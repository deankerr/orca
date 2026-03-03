import { XIcon } from 'lucide-react'

import { SearchInput } from '../shared/search-input'
import { Button } from '../ui/button'
import { AttributeFilterControls, ModalityFilterControls } from './attribute-filter-controls'
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
    <div className="flex items-center gap-2 px-3 py-4">
      <EndpointsSearchInput />
      <ModalityFilterControls />
      <AttributeFilterControls />

      {hasAnyFilter && (
        <Button variant="secondary" onClick={clearAllFilters}>
          <XIcon />
          Clear
        </Button>
      )}
    </div>
  )
}
