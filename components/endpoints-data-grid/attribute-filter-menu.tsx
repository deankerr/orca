'use client'

import { FilterIcon } from 'lucide-react'

import { endpointFilterAttributeGroups } from '@/lib/attribute-groups'
import type { AttributeKey } from '@/lib/attributes'
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
import { useEndpointFilters } from './use-endpoint-filters'

export function AttributeFilterMenu() {
  const { attributeFilters, setAttributeFilter, clearAttributeFilters, activeAttributeCount } =
    useEndpointFilters()

  const renderAttributeToggle = (name: AttributeKey) => (
    <FilterMenuToggleItem
      key={name}
      icon={attributes[name].icon}
      label={attributes[name].label}
      mode={attributeFilters[name] ?? 'any'}
      onChange={(mode) => {
        setAttributeFilter(name, mode)
      }}
    />
  )

  return (
    <FilterMenu>
      <FilterMenuTrigger icon={FilterIcon} label="Attributes" activeCount={activeAttributeCount} />

      <FilterMenuContent className="w-[min(100vw-2rem,520px)]">
        <FilterMenuHeader
          icon={FilterIcon}
          title="Attributes"
          description="Filter by feature support, status flags, and provider policy signals."
          action={
            <FilterMenuClearAction
              onClick={clearAttributeFilters}
              disabled={activeAttributeCount === 0}
              className={cn(activeAttributeCount === 0 && 'invisible')}
            >
              Clear
            </FilterMenuClearAction>
          }
        />

        <FilterMenuBody>
          <FilterMenuSection
            title="Features"
            description="Core endpoint capabilities and execution features."
          >
            {endpointFilterAttributeGroups.features.map(renderAttributeToggle)}
          </FilterMenuSection>

          <FilterMenuSection title="Status" description="Lifecycle and operational state markers.">
            {endpointFilterAttributeGroups.status.map(renderAttributeToggle)}
          </FilterMenuSection>

          <FilterMenuSection
            title="Data Policy"
            description="Training and retention policy indicators surfaced by providers."
          >
            {endpointFilterAttributeGroups.dataPolicy.map(renderAttributeToggle)}
          </FilterMenuSection>
        </FilterMenuBody>
      </FilterMenuContent>
    </FilterMenu>
  )
}
