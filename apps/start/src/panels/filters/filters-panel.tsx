import { ScrollArea } from '@orca/ui/components/scroll-area'
import { cn } from 'cn'
import type { ReactNode } from 'react'

import { HeaderBar } from '#app/header-bar'
import { DOCKED_FILTERS_MEDIA_CLASS } from '#app/panel-layout'
import { panelFrameClass, usePlacement } from '#app/panels'
import { useScopeFilters } from '#endpoints/hooks'

import { ListFacet } from './list-facet'
import { PropertyFacets } from './property-facets'
import { RangeFacets } from './range-facets'

/** The Filters panel's frame, which the loading skeleton fills with placeholders. */
export function FiltersFrame({ children }: { children: ReactNode }) {
  const placement = usePlacement()

  return (
    <aside
      aria-label="Filters"
      className={cn(
        'flex flex-col overflow-clip bg-card',
        panelFrameClass(placement, 'w-68'),
        placement === 'docked' && DOCKED_FILTERS_MEDIA_CLASS,
      )}
    >
      <HeaderBar />
      <ScrollArea className="min-h-0 grow border-t border-border">
        <div className="flex flex-col">{children}</div>
      </ScrollArea>
    </aside>
  )
}

export function FiltersPanel() {
  const { model, provider } = useScopeFilters()

  return (
    <FiltersFrame>
      <ListFacet kind="model" selected={model} />
      <ListFacet kind="provider" selected={provider} />
      <RangeFacets />
      <PropertyFacets />
    </FiltersFrame>
  )
}
