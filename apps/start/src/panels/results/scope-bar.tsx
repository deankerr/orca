import { formatNumber } from '@orca/backend/numbers'
import { Badge } from '@orca/ui/components/badge'
import { Button } from '@orca/ui/components/button'
import { Toggle } from '@orca/ui/components/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@orca/ui/components/tooltip'
import { cn } from 'cn'
import { ChartScatter, SlidersHorizontal } from 'lucide-react'

import type { FiltersPlacement } from '#app/panel-layout'
import { FLUSH_TOP_MEDIA_CLASS } from '#app/panel-layout'
import { usePanelLayout, useToggleFilters } from '#app/panels'
import { usePlot, useScopeActions, useScopeFilters, useScopeSummary } from '#endpoints/hooks'
import { activeFilterCount } from '#endpoints/scope'

const count = (value: number, noun: string) =>
  `${formatNumber(value)} ${noun}${value === 1 ? '' : 's'}`

/** What the Filters button does, for its tooltip. */
const FILTERS_ACTION: Record<FiltersPlacement, string> = {
  collapsed: 'Show filters',
  docked: 'Hide filters',
  drawer: 'Filters',
}

/**
 * Opens the Filters drawer, or collapses and expands docked Filters. It carries the active filter
 * count, which its name reads out.
 */
function FiltersButton({ filters, placement }: { filters: number; placement: FiltersPlacement }) {
  const toggle = useToggleFilters(placement)

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-expanded={placement === 'drawer' ? undefined : placement === 'docked'}
            aria-label={filters > 0 ? `Filters, ${formatNumber(filters)} active` : 'Filters'}
            className="relative pointer-coarse:size-8"
            onClick={toggle}
            size="icon"
            variant="ghost"
          />
        }
      >
        <SlidersHorizontal aria-hidden="true" />
        {filters > 0 && (
          <Badge aria-hidden="true" className="absolute -top-1 -right-1 h-4 min-w-4 px-1">
            {formatNumber(filters)}
          </Badge>
        )}
      </TooltipTrigger>
      <TooltipContent>{FILTERS_ACTION[placement]}</TooltipContent>
    </Tooltip>
  )
}

function PlotToggle() {
  const plot = usePlot()
  const { togglePlot } = useScopeActions()

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            aria-label="Plot"
            className="pointer-coarse:size-8"
            onPressedChange={togglePlot}
            pressed={plot}
          />
        }
      >
        <ChartScatter aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{plot ? 'Hide plot' : 'Show plot'}</TooltipContent>
    </Tooltip>
  )
}

/** The scope bar's frame, which the loading skeleton shares. */
export const SCOPE_BAR_CLASS = cn(
  'flex min-h-10 shrink-0 items-center justify-between gap-x-3 px-(--results-inset) py-1',
  FLUSH_TOP_MEDIA_CLASS,
)

/**
 * The scope's counts. Unfiltered they share one line; filtered, the in-scope count is a title over
 * the catalogue's total and the models and providers in scope.
 */
function ScopeCounts({ filtered }: { filtered: boolean }) {
  const { endpoints, models, providers } = useScopeSummary()

  return (
    <div
      className={cn('flex min-w-0', filtered ? 'flex-col' : 'flex-wrap items-baseline gap-x-2.5')}
    >
      <span className="text-sm/5 font-semibold whitespace-nowrap">
        {count(endpoints.inScope, 'endpoint')}
      </span>
      {/* A narrow panel breaks the counts only between them. */}
      <span className="font-mono text-[11px] leading-4 text-muted-foreground">
        {filtered && (
          <>
            <span className="whitespace-nowrap">of {formatNumber(endpoints.total)} ·</span>{' '}
          </>
        )}
        <span className="whitespace-nowrap">{count(models.inScope, 'model')} ·</span>{' '}
        <span className="whitespace-nowrap">{count(providers.inScope, 'provider')}</span>
      </span>
    </div>
  )
}

export function ScopeBar() {
  const scopeFilters = useScopeFilters()
  const { clearFilters } = useScopeActions()
  const filters = activeFilterCount(scopeFilters)
  const placement = usePanelLayout().filters

  return (
    <div className={SCOPE_BAR_CLASS}>
      <div className="flex min-w-0 items-center gap-2">
        <FiltersButton filters={filters} placement={placement} />
        <ScopeCounts filtered={filters > 0} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* The Filters drawer carries its own Clear; a column beside Results leaves it here. */}
        {filters > 0 && placement !== 'drawer' && (
          <Button onClick={clearFilters} size="xs" variant="ghost">
            Clear
          </Button>
        )}
        <PlotToggle />
      </div>
    </div>
  )
}
