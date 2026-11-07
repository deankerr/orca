import { Button } from '@orca/ui/components/button'
import { DrawerClose } from '@orca/ui/components/drawer'
import { ScrollArea } from '@orca/ui/components/scroll-area'
import { cn } from 'cn'
import { XIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { HeaderBar } from '#app/header-bar'
import { panelFrameClass, usePlacement } from '#app/panels'
import { useScopeActions, useScopeFilters } from '#endpoints/hooks'
import { activeFilterCount } from '#endpoints/scope'

import { ListFacet } from './list-facet'
import { PropertyFacets } from './property-facets'
import { RangeFacets } from './range-facets'

/**
 * The drawer's own controls, in its header: Clear, which the scope bar keeps beside docked Filters,
 * and close.
 */
function DrawerActions() {
  const filters = activeFilterCount(useScopeFilters())
  const { clearFilters } = useScopeActions()

  return (
    <div className="ml-auto flex items-center gap-1.5">
      {filters > 0 && (
        <Button onClick={clearFilters} size="xs" variant="ghost">
          Clear
        </Button>
      )}
      <DrawerClose render={<Button aria-label="Close filters" size="icon" variant="ghost" />}>
        <XIcon aria-hidden="true" data-icon="inline-start" />
      </DrawerClose>
    </div>
  )
}

/** The Filters panel's frame, which the loading skeleton fills with placeholders. */
export function FiltersFrame({ children }: { children: ReactNode }) {
  const placement = usePlacement()

  return (
    <aside
      aria-label="Filters"
      className={cn('flex flex-col overflow-clip bg-card', panelFrameClass(placement, 'w-68'))}
    >
      <HeaderBar>{placement === 'drawer' && <DrawerActions />}</HeaderBar>
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
