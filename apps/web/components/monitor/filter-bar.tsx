'use client'

import { ModelCombobox, ProviderCombobox } from '../shared/or-entity-combobox'
import type { useMonitorFilters } from './use-monitor-filters'

export function FilterBar({ filters }: { filters: ReturnType<typeof useMonitorFilters> }) {
  return (
    <div className="border-b py-3">
      <div className="mx-auto flex max-w-xl gap-3 px-2">
        <ModelCombobox
          id="model-filter"
          value={filters.modelSlug}
          onValueChange={filters.setModelSlug}
          className="flex-1 justify-start"
        />
        <ProviderCombobox
          id="provider-filter"
          value={filters.providerSlug}
          onValueChange={filters.setProviderSlug}
          className="flex-1 justify-start"
        />
      </div>
    </div>
  )
}
