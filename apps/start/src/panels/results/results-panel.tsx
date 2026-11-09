import { ScrollArea } from '@orca/ui/components/scroll-area'
import { cn } from 'cn'
import type { ReactNode } from 'react'

import { RESULTS_REGION_ID } from '#app/keyboard'
import { FLUSH_FRAME_MEDIA_CLASS, tableTrailingInset } from '#app/panel-layout'
import { usePanelLayout } from '#app/panels'
import { StatusBar } from '#app/status-bar'
import { useSelectedId } from '#endpoints/hooks'
import { PlotRegion } from '#panels/results/plot/price-plot'
import { EndpointTable } from '#panels/results/table/endpoint-table'

import { ScopeBar } from './scope-bar'

/**
 * The Results panel's frame, which the loading skeleton fills with placeholders. It is the primary
 * Panel, docked in every layout, and a size container: its parts adapt to its width, not the page's.
 * Where it is the only docked Panel it runs to the screen's edges without a border.
 *
 * Its table-like parts share one side inset, `--results-inset`: the Table's edge cells and the status
 * bar line up on it, and a narrow panel tightens it. The header, the scope bar and the plot, sit closer
 * to the frame, on `--results-header-inset`, so the Filters button is as far from the left edge as from
 * the top.
 */
export function ResultsFrame({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Results"
      data-table-keys=""
      className={cn(
        '@container/results flex min-w-0 grow basis-0 flex-col overflow-clip rounded-xl border border-border bg-background outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
        FLUSH_FRAME_MEDIA_CLASS,
      )}
      // Not a tab stop: it only takes focus from code, when a closing panel's row has been filtered out.
      id={RESULTS_REGION_ID}
      tabIndex={-1}
    >
      {/* A size container cannot query itself, so the inset is set one level in. */}
      <div className="flex min-h-0 grow flex-col [--results-header-inset:--spacing(2)] [--results-inset:--spacing(4)] @max-md/results:[--results-inset:--spacing(3)]">
        {children}
      </div>
    </section>
  )
}

/**
 * The Table's scroll area. While the Endpoint drawer floats beside it, the Table's scroll width grows
 * by the drawer's (see `tableTrailingInset`), so every column can scroll out from under it; the Table
 * itself keeps its width, so selecting reflows nothing.
 */
function TableRegion() {
  const layout = usePanelLayout()
  const trailingInset = tableTrailingInset(layout, useSelectedId() !== undefined)

  return (
    // The sticky header lives in this viewport, which never bounces, so the header holds still.
    <ScrollArea className="min-h-0 grow" horizontal render={<section aria-label="Results table" />}>
      <EndpointTable trailingInset={trailingInset} />
    </ScrollArea>
  )
}

export function ResultsPanel() {
  return (
    <ResultsFrame>
      <ScopeBar />
      <PlotRegion />
      <TableRegion />
      <StatusBar />
    </ResultsFrame>
  )
}
