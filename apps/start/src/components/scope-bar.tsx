import { formatNumber } from '@orca/backend/numbers'
import { ChartScatter } from 'lucide-react'

import {
  useEndpointSearch,
  useEndpointSearchActions,
  useScopeSummary,
} from '#features/endpoints/hooks'
import { activeFilterCount } from '#features/endpoints/search'

const count = (value: number, noun: string) =>
  `${formatNumber(value)} ${noun}${value === 1 ? '' : 's'}`

export function ScopeBar() {
  const { endpoints, models, providers } = useScopeSummary()
  const search = useEndpointSearch()
  const { clearFilters, togglePlot } = useEndpointSearchActions()
  const filters = activeFilterCount(search)

  return (
    <div className="flex h-12 shrink-0 items-center justify-between px-5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-sm/5 font-semibold">{count(endpoints.inScope, 'endpoint')}</span>
        <span className="font-mono text-[11px] leading-4 text-muted-foreground">
          of {formatNumber(endpoints.total)} · {count(models.inScope, 'model')} ·{' '}
          {count(providers.inScope, 'provider')}
        </span>
      </div>
      <div className="flex items-center gap-3.5 font-mono text-[11px] leading-4">
        {filters > 0 && (
          <>
            <span className="text-muted-foreground">{count(filters, 'filter')}</span>
            <button className="underline underline-offset-2" onClick={clearFilters} type="button">
              clear
            </button>
          </>
        )}
        <button
          aria-pressed={search.plot}
          className="flex items-center gap-1.5"
          onClick={togglePlot}
          type="button"
        >
          <ChartScatter aria-hidden="true" className="size-3.5 text-muted-foreground" />
          plot
        </button>
      </div>
    </div>
  )
}
