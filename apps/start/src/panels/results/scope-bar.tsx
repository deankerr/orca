import { formatNumber } from '@orca/backend/numbers'
import { Button } from '@orca/ui/components/button'
import { Toggle } from '@orca/ui/components/toggle'
import { ChartScatter, SlidersHorizontal } from 'lucide-react'

import { setFiltersSheetOpen, usePanelLayout } from '#app/panels'
import { usePlot, useScopeActions, useScopeFilters, useScopeSummary } from '#endpoints/hooks'
import { activeFilterCount } from '#endpoints/scope'

const count = (value: number, noun: string) =>
  `${formatNumber(value)} ${noun}${value === 1 ? '' : 's'}`

/** Opens the Filters sheet, in layouts that put Filters in one. It carries the active filter count. */
function FiltersButton({ filters }: { filters: number }) {
  return (
    <Button
      aria-label={filters > 0 ? `Filters, ${count(filters, 'active filter')}` : 'Filters'}
      className="h-6 shrink-0 gap-1.5 self-center px-2 font-mono text-[11px] leading-4 font-normal pointer-coarse:h-8"
      onClick={() => {
        setFiltersSheetOpen(true)
      }}
      variant="outline"
    >
      <SlidersHorizontal aria-hidden="true" className="size-3.5 text-muted-foreground" />
      filters
      {filters > 0 && <span className="text-foreground tabular-nums">{filters}</span>}
    </Button>
  )
}

/** The scope bar's frame, which the loading skeleton shares. A narrow panel wraps its counts. */
export const SCOPE_BAR_CLASS =
  'flex min-h-12 shrink-0 items-center justify-between gap-x-3 px-5 py-1.5 @max-md/results:px-3'

export function ScopeBar() {
  const { endpoints, models, providers } = useScopeSummary()
  const plot = usePlot()
  const scopeFilters = useScopeFilters()
  const { clearFilters, togglePlot } = useScopeActions()
  const filters = activeFilterCount(scopeFilters)
  const filtersInSheet = usePanelLayout().filters === 'sheet'

  return (
    <div className={SCOPE_BAR_CLASS}>
      <div className="flex min-w-0 items-center gap-2.5">
        {filtersInSheet && <FiltersButton filters={filters} />}
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
          <span className="text-sm/5 font-semibold whitespace-nowrap">
            {count(endpoints.inScope, 'endpoint')}
          </span>
          {/* A narrow panel breaks the counts only between them. */}
          <span className="font-mono text-[11px] leading-4 text-muted-foreground">
            <span className="whitespace-nowrap">of {formatNumber(endpoints.total)} ·</span>{' '}
            <span className="whitespace-nowrap">{count(models.inScope, 'model')} ·</span>{' '}
            <span className="whitespace-nowrap">{count(providers.inScope, 'provider')}</span>
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3.5 font-mono text-[11px] leading-4">
        {filters > 0 && (
          <>
            {/* The Filters button carries the count when there is one. */}
            {!filtersInSheet && (
              <span className="text-muted-foreground">{count(filters, 'filter')}</span>
            )}
            <Button
              className="h-auto rounded-sm border-0 px-0 font-mono text-[11px] leading-4 font-normal text-foreground underline pointer-coarse:h-8"
              onClick={clearFilters}
              variant="link"
            >
              clear
            </Button>
          </>
        )}
        <Toggle
          className="h-5 min-w-0 gap-1.5 rounded-sm px-1.5 font-mono text-[11px] leading-4 font-normal pointer-coarse:h-8"
          onPressedChange={togglePlot}
          pressed={plot}
        >
          <ChartScatter aria-hidden="true" className="size-3.5 text-muted-foreground" />
          plot
        </Toggle>
      </div>
    </div>
  )
}
