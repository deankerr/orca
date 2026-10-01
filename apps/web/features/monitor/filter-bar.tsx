'use client'

import { Button } from '@/components/ui/button'

import { ModelCombobox, ProviderCombobox } from './entity-combobox'
import type { useMonitorFilters } from './use-monitor-filters'

export function FilterBar({ filters }: { filters: ReturnType<typeof useMonitorFilters> }) {
  return (
    <div className="border-b py-3">
      <div className="mx-auto flex max-w-xl gap-3 px-2">
        {filters.endpointId ? (
          <Button
            variant="outline"
            className="w-full justify-between font-mono"
            onClick={() => {
              filters.setEndpointId('')
            }}
          >
            <span className="truncate">Endpoint {filters.endpointId}</span>
            <span className="ml-3">Clear</span>
          </Button>
        ) : (
          <>
            <ModelCombobox
              id="model-filter"
              value={filters.modelId}
              onValueChange={filters.setModelId}
              className="flex-1 justify-start"
            />
            <ProviderCombobox
              id="provider-filter"
              value={filters.providerId}
              onValueChange={filters.setProviderId}
              className="flex-1 justify-start"
            />
          </>
        )}
      </div>
    </div>
  )
}
