'use client'

import { LayoutGridIcon } from 'lucide-react'

import {
  endpointModalityInputAttributes,
  endpointModalityOutputAttributes,
} from '@/lib/attribute-groups'
import type { EndpointModalityAttribute } from '@/lib/attribute-groups'
import { attributes } from '@/lib/attributes'
import { cn } from '@/lib/utils'

import {
  FilterMenu,
  FilterMenuBody,
  FilterMenuClearAction,
  FilterMenuContent,
  FilterMenuHeader,
  FilterMenuSection,
  FilterMenuToggleItem,
  FilterMenuTrigger,
} from './filter-menu'
import { useEndpointFacetState } from './use-endpoint-facet-state'

function getModalityFilterLabel(name: EndpointModalityAttribute) {
  return attributes[name].label.replace(/ (?:Input|Output)$/, '')
}

export function ModalityFilterMenu() {
  const { modalityFilters, setModalityFilter, clearModalityFilters, activeModalityCount } =
    useEndpointFacetState()

  const renderModalityToggle = (name: EndpointModalityAttribute) => (
    <FilterMenuToggleItem
      key={name}
      icon={attributes[name].icon}
      label={getModalityFilterLabel(name)}
      mode={modalityFilters[name]}
      onChange={(mode) => {
        setModalityFilter(name, mode)
      }}
    />
  )

  return (
    <FilterMenu>
      <FilterMenuTrigger
        icon={LayoutGridIcon}
        label="Modalities"
        activeCount={activeModalityCount}
      />

      <FilterMenuContent className="w-[min(100vw-2rem,520px)]">
        <FilterMenuHeader
          icon={LayoutGridIcon}
          title="Modalities"
          description="Constrain endpoint support across input and output formats."
          action={
            <FilterMenuClearAction
              onClick={clearModalityFilters}
              disabled={activeModalityCount === 0}
              className={cn(activeModalityCount === 0 && 'invisible')}
            >
              Clear
            </FilterMenuClearAction>
          }
        />

        <FilterMenuBody>
          <FilterMenuSection title="Input" description="Capabilities accepted by the endpoint.">
            {endpointModalityInputAttributes.map(renderModalityToggle)}
          </FilterMenuSection>

          <FilterMenuSection title="Output" description="Modalities the endpoint can return.">
            {endpointModalityOutputAttributes.map(renderModalityToggle)}
          </FilterMenuSection>
        </FilterMenuBody>
      </FilterMenuContent>
    </FilterMenu>
  )
}
