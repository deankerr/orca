import { Skeleton } from '@orca/ui/components/skeleton'

import { StatusBarFrame } from '#app/status-bar'
import { usePlot } from '#endpoints/hooks'

import { PlotSkeleton } from './plot/plot-skeleton'
import { ResultsFrame } from './results-panel'
import { SCOPE_BAR_CLASS } from './scope-bar'
import { TableSkeleton } from './table/table-skeleton'

/** The scope bar's counts and plot toggle, at the bar's height. */
function ScopeBarSkeleton() {
  return (
    <div className={SCOPE_BAR_CLASS}>
      <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
        <Skeleton className="h-4 w-28 rounded-sm" />
        <Skeleton className="h-3 w-52 rounded-sm" />
      </div>
      <Skeleton className="h-5 w-14 rounded-sm" />
    </div>
  )
}

/**
 * The Results panel as the route's pending state shows it: the real frame, the status bar's fixed text
 * and theme menu, the plot's caption, and placeholders for the counts, the plot, the scan time, and the table's rows.
 */
export function ResultsSkeleton() {
  // The URL is known while the catalogue loads, so a plot switched off in it leaves no gap.
  const plot = usePlot()

  return (
    <ResultsFrame>
      <ScopeBarSkeleton />
      {plot ? <PlotSkeleton /> : null}
      {/* Clipped, not scrolled: it holds more rows than any viewport shows. */}
      <div aria-hidden="true" className="min-h-0 grow overflow-hidden">
        <TableSkeleton />
      </div>
      <StatusBarFrame scanTime={<Skeleton className="h-3 w-36 rounded-sm" />} />
    </ResultsFrame>
  )
}
