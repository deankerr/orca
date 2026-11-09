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
            className="relative"
            onClick={toggle}
            size="icon"
            variant="ghost"
          />
        }
      >
        <SlidersHorizontal aria-hidden="true" data-icon="inline-start" />
        {filters > 0 && (
          <Badge aria-hidden="true" className="absolute -top-1.5 -right-1.5" size="sm">
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
          <Toggle aria-label="Plot" onPressedChange={togglePlot} pressed={plot} size="icon" />
        }
      >
        <ChartScatter aria-hidden="true" data-icon="inline-start" />
      </TooltipTrigger>
      <TooltipContent>{plot ? 'Hide plot' : 'Show plot'}</TooltipContent>
    </Tooltip>
  )
}

/** The scope bar's frame, which the loading skeleton shares. */
export const SCOPE_BAR_CLASS = cn(
  'flex shrink-0 items-center justify-between gap-x-3 p-(--results-header-inset)',
  FLUSH_TOP_MEDIA_CLASS,
)

/**
 * The scope's counts on one line: the in-scope endpoints, then, when filtered, the catalogue's
 * total, and the models and providers in scope.
 */
function ScopeCounts({ filtered }: { filtered: boolean }) {
  const { endpoints, models, providers } = useScopeSummary()

  return (
    // Wrapped, the two lines are taller than the button; the bar's height stays the button's.
    <div className="-my-1 flex min-w-0 flex-wrap items-baseline gap-x-2.5">
      <span className="text-[13px]/5 font-semibold whitespace-nowrap">
        {count(endpoints.inScope, 'endpoint')}
      </span>
      {/* A narrow panel breaks the counts only between them. */}
      <span className="font-mono text-[10px] leading-4 text-muted-foreground">
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
