import { formatPrice } from '@orca/backend/numbers'
import type { Workload } from '@orca/pricing'
import { Chart } from '@tanstack/charts/react'
import { useSelector } from '@tanstack/react-store'
import { createAtom } from '@tanstack/store'
import type { Atom } from '@tanstack/store'
import { useMemo, useState } from 'react'

import {
  useDeferredFilteredRows,
  usePlot,
  useSelectedId,
  useSnapshot,
  useScopeActions,
  useWorkload,
} from '#endpoints/hooks'
import { setHoveredEndpoint, useHoveredEndpointId } from '#endpoints/hover'
import type { EndpointRow } from '#endpoints/snapshot'
import { formatCount } from '#lib/format'
import { NoCacheMark } from '#panels/results/no-cache-mark'
import { StaleVeil } from '#panels/results/stale-veil'
import { workloadDescription } from '#panels/results/workload'

import { CHART_HEIGHT, formatPriceTick, plotDefinition, yTickLabelsClearance } from './definition'
import {
  decadeTicks,
  notPlottedReason,
  plotPoints,
  plottableRow,
  priceDomain,
  splitByScope,
  throughputDomain,
} from './points'
import type { PlotPoint } from './points'

/** What the overlay needs from the chart's last layout to place a dot, in the chart's own pixels. */
interface Projection {
  x: (price: number) => number
  y: (throughput: number) => number
  width: number
  height: number
  /** The plotting area inside the chart's margins. */
  plot: { height: number; left: number; top: number; width: number }
}

type ProjectionAtom = Atom<Projection | null>

interface ScopeSplit {
  points: readonly PlotPoint[]
  ids: ReadonlySet<string>
  inScope: PlotPoint[]
  outOfScope: PlotPoint[]
}

interface DeferredScopeSplit {
  split: ScopeSplit
  /** True while the dots still reflect the previous filters. */
  stale: boolean
}

function sameMembers(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id))
}

/**
 * The points split by the filters, which they trail (see `useDeferredFilteredRows`). The split keeps
 * its identity while the same endpoints stay in scope, so a filter change that leaves the plotted
 * endpoints as they were does not rebuild the chart.
 */
function useScopeSplit(points: readonly PlotPoint[]): DeferredScopeSplit {
  const { rows: filtered, stale } = useDeferredFilteredRows()

  const next = useMemo(() => {
    const ids = new Set(filtered.map((row) => row.id))

    return { ids, points, ...splitByScope(points, ids) }
  }, [filtered, points])

  const [split, setSplit] = useState(next)

  if (split !== next && (split.points !== points || !sameMembers(split.ids, next.ids))) {
    setSplit(next)
  }

  return { split, stale }
}

/** The plot's caption: its axes, on one line. */
export function ChartCaption() {
  return (
    <div className="truncate font-mono text-[10px] leading-3.5 tracking-[0.04em] text-muted-foreground uppercase">
      Cost $/M × tok/s p50 · log scales
    </div>
  )
}

/** The plot region's frame, which the loading skeleton shares. */
export const PLOT_REGION_CLASS =
  'flex shrink-0 flex-col gap-0.5 px-(--results-header-inset) pb-(--results-header-inset)'

/** The dots, grid, and axes: rebuilt only when the catalogue or the filters change the dots. */
function PlotChart({
  ariaDescription,
  ariaLabel,
  definition,
  projection,
}: {
  ariaDescription: string
  ariaLabel: string
  definition: ReturnType<typeof plotDefinition>
  projection: ProjectionAtom
}) {
  const { selectEndpoint } = useScopeActions()

  return (
    <Chart
      ariaDescription={ariaDescription}
      ariaLabel={ariaLabel}
      className="font-mono text-[10px] text-muted-foreground"
      definition={definition}
      height={CHART_HEIGHT}
      onFocusChange={(point) => {
        setHoveredEndpoint(point === null ? null : point.datum.id)
      }}
      onRender={({ scene }) => {
        const { x, y } = scene.scales

        if (x !== undefined && y !== undefined) {
          projection.set({
            height: scene.height,
            plot: {
              height: scene.chart.height,
              left: scene.chart.x,
              top: scene.chart.y,
              width: scene.chart.width,
            },
            width: scene.width,
            x: (price) => x.map(price),
            y: (throughput) => y.map(throughput),
          })
        }
      }}
      onSelect={(point) => {
        // A click on empty plot reports null; only a dot changes the selection.
        if (point !== null) {
          selectEndpoint(point.datum.id)
        }
      }}
    />
  )
}

const labelClass =
  'absolute flex h-4 items-center whitespace-nowrap rounded-sm border border-border-solid bg-popover px-1.25 font-mono text-[10px] leading-3.5'

function label(row: EndpointRow) {
  return `${row.model.name} · ${row.provider.display_name}`
}

function detail({ cost, noCache, row }: PlottedRow) {
  return `${label(row)} · ${formatPrice(cost)}/M · ${formatCount(row.throughput)} tok/s${noCache ? ' · no cache' : ''}`
}

/** Which part of the label sits on the dot's x: its start near the left edge, its end near the right. */
function labelShift(x: number, width: number): string {
  if (x < width * 0.25) {
    return '0%'
  }

  return x > width * 0.75 ? '-100%' : '-50%'
}

/** Where a label sits against its dot: above it, or below near the top, and away from the nearer side edge. */
function labelPlacement(x: number, y: number, projection: Projection) {
  const above = y > projection.plot.top + 26

  return {
    left: x,
    top: above ? y - 10 : y + 10,
    transform: `translate(${labelShift(x, projection.width)}, ${above ? '-100%' : '0'})`,
  }
}

function Marker({
  plotted: { cost, noCache, row },
  projection,
  tone,
}: {
  plotted: PlottedRow
  projection: Projection
  tone: 'hover' | 'selection'
}) {
  const x = projection.x(cost)
  const y = projection.y(row.throughput ?? 0)
  const stroke = tone === 'selection' ? 'var(--selection)' : 'var(--foreground)'

  return (
    <g>
      <circle cx={x} cy={y} fill="var(--background)" r={5} stroke={stroke} strokeWidth={1.5} />
      {/* The ring's own mark: a hollow centre where the endpoint's lack of a cache raises its cost. */}
      {noCache ? (
        <circle cx={x} cy={y} fill="none" r={1.75} stroke={stroke} strokeWidth={1} />
      ) : (
        <circle cx={x} cy={y} fill={stroke} r={2} />
      )}
    </g>
  )
}

function MarkerLabel({
  plotted,
  projection,
  tone,
}: {
  plotted: PlottedRow
  projection: Projection
  tone: 'hover' | 'selection'
}) {
  const { cost, row } = plotted
  const x = projection.x(cost)
  const y = projection.y(row.throughput ?? 0)

  return (
    <div
      className={`${labelClass} ${tone === 'selection' ? 'text-selection' : 'text-foreground'}`}
      style={labelPlacement(x, y, projection)}
    >
      {tone === 'hover' ? detail(plotted) : label(row)}
    </div>
  )
}

/** A row with its cost under the workload: what the overlay draws. */
interface PlottedRow {
  cost: number
  /** Whether the endpoint's lack of a cache raises its cost; see `isCostRaisedByNoCache`. */
  noCache: boolean
  row: EndpointRow
}

/** A row's place on the plot, or null when it has none: free, unpriced, or without throughput. */
function plottedRow(row: EndpointRow | undefined, workload: Workload): PlottedRow | null {
  if (row === undefined) {
    return null
  }

  const plottable = plottableRow(row, workload)

  // `notPlottedReason` has checked the cost, but not narrowed it.
  return notPlottedReason(plottable) === null
    ? { cost: plottable.cost ?? 0, noCache: plottable.noCache, row }
    : null
}

/**
 * The frame, the selected endpoint's ring and label, and the hovered endpoint's ring and tooltip. It
 * reads hover and selection itself, so they re-render only this, never the chart under it.
 */
function PlotOverlay({
  captionInset,
  projection: atom,
  showNoCache,
}: {
  captionInset: number
  projection: ProjectionAtom
  /** Whether any plotted endpoint is a ring, so the corner explains them. */
  showNoCache: boolean
}) {
  const projection = useSelector(atom)
  const { byId } = useSnapshot()
  const endpoint = useSelectedId()
  const hoveredId = useHoveredEndpointId()
  const workload = useWorkload()

  if (projection === null) {
    return null
  }

  const selected = plottedRow(endpoint === undefined ? undefined : byId.get(endpoint), workload)
  const hovered = plottedRow(hoveredId === null ? undefined : byId.get(hoveredId), workload)
  const hoverIsSelection = hovered !== null && hovered.row.id === selected?.row.id

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <svg
        className="absolute inset-0 overflow-visible"
        height={projection.height}
        width={projection.width}
      >
        <rect
          fill="none"
          height={projection.plot.height - 1}
          stroke="var(--border-solid)"
          width={projection.plot.width - 1}
          x={projection.plot.left + 0.5}
          y={projection.plot.top + 0.5}
        />
        {selected !== null && (
          <Marker plotted={selected} projection={projection} tone="selection" />
        )}
        {hovered !== null && !hoverIsSelection && (
          <Marker plotted={hovered} projection={projection} tone="hover" />
        )}
      </svg>
      {/* Which way is better, in the corner it points to, clear of the y tick labels, and what a ring means, where there are rings. */}
      <span
        className="absolute flex items-center gap-3 font-mono text-[10px] leading-3.5 whitespace-nowrap text-muted-foreground"
        style={{ left: projection.plot.left + captionInset, top: projection.plot.top + 2 }}
      >
        <span>↖ cheaper and faster</span>
        {showNoCache ? (
          <span className="flex items-center gap-1">
            <NoCacheMark /> no cache
          </span>
        ) : null}
      </span>
      {selected !== null && !hovered && (
        <MarkerLabel plotted={selected} projection={projection} tone="selection" />
      )}
      {hovered !== null && (
        <MarkerLabel
          plotted={hovered}
          projection={projection}
          tone={hoverIsSelection ? 'selection' : 'hover'}
        />
      )}
    </div>
  )
}

function PricePlot() {
  const { rows } = useSnapshot()
  const workload = useWorkload()

  const points = useMemo(
    () => plotPoints(rows.map((row) => plottableRow(row, workload))),
    [rows, workload],
  )

  const {
    split: { inScope, outOfScope },
    stale,
  } = useScopeSplit(points)

  // Both axes span the whole catalogue under the workload, so filtering moves dots, never the axes.
  const domain = useMemo(() => throughputDomain(points), [points])
  const costDomain = useMemo(() => priceDomain(points), [points])

  // Rebuilt when the dots or the axes change: the filters, or the workload.
  const definition = useMemo(
    () =>
      plotDefinition({
        inScope,
        outOfScope,
        priceDomain: costDomain,
        throughputDomain: domain,
      }),
    [inScope, outOfScope, costDomain, domain],
  )

  const projection = useMemo(() => createAtom<Projection | null>(null), [])
  // Rings appear only where a lack of a cache raises an endpoint's cost, so none under a hit rate of 0.
  const showNoCache = points.some((point) => point.noCache)
  const noCacheCaption = showNoCache ? ' Hollow rings are endpoints with no cache.' : ''
  const ariaLabel = 'Workload cost against median throughput, one point per endpoint'
  const description = `${formatCount(points.length)} of ${formatCount(rows.length)} endpoints plotted, ${formatCount(inScope.length)} of them in the current filters. Workload cost, for ${workloadDescription(workload)}, from ${formatPriceTick(costDomain[0])} to ${formatPriceTick(costDomain[1])} per million tokens on a log scale, against median throughput from ${formatCount(domain[0])} to ${formatCount(domain[1])} tokens per second on a log scale.${noCacheCaption}`

  return (
    <div className={PLOT_REGION_CLASS}>
      <ChartCaption />
      <div aria-busy={stale} className="relative">
        <PlotChart
          ariaDescription={description}
          ariaLabel={ariaLabel}
          definition={definition}
          projection={projection}
        />
        {/* Only the dots dim: the selection and hover rings in the overlay follow the pointer, not the filters. */}
        <StaleVeil className="inset-0" stale={stale} />
        <PlotOverlay
          captionInset={yTickLabelsClearance(decadeTicks(domain))}
          projection={projection}
          showNoCache={showNoCache}
        />
      </div>
    </div>
  )
}

/** The plot between the scope bar and the Table; nothing when the scope bar's plot toggle is off. */
export function PlotRegion() {
  const plot = usePlot()

  return plot ? <PricePlot /> : null
}
