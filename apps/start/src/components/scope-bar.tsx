import { formatNumber } from '@orca/backend/numbers'
import { Button } from '@orca/ui/components/button'
import { Toggle } from '@orca/ui/components/toggle'
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
            <Button
              className="h-auto rounded-sm border-0 px-0 font-mono text-[11px] leading-4 font-normal text-foreground underline"
              onClick={clearFilters}
              variant="link"
            >
              clear
            </Button>
          </>
        )}
        <Toggle
          className="h-5 min-w-0 gap-1.5 rounded-sm px-1.5 font-mono text-[11px] leading-4 font-normal"
          onPressedChange={togglePlot}
          pressed={search.plot}
        >
          <ChartScatter aria-hidden="true" className="size-3.5 text-muted-foreground" />
          plot
        </Toggle>
      </div>
    </div>
  )
}
