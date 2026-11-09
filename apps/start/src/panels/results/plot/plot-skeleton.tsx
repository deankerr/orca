import { Skeleton } from '@orca/ui/components/skeleton'

import { CHART_HEIGHT } from './definition'
import { ChartCaption, PLOT_REGION_CLASS } from './price-plot'

/** The plot as the route's pending state shows it: the real caption over a block the chart's height. */
export function PlotSkeleton() {
  return (
    <div className={PLOT_REGION_CLASS}>
      <ChartCaption />
      <Skeleton className="w-full rounded-none" style={{ height: CHART_HEIGHT }} />
    </div>
  )
}
