import { formatPrice } from '@orca/backend/numbers'
import { Tooltip, TooltipContent, TooltipTrigger } from '@orca/ui/components/tooltip'
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
} from '#endpoints/hooks'
import { setHoveredEndpoint, useHoveredEndpointId } from '#endpoints/hover'
import type { EndpointRow } from '#endpoints/snapshot'
import { formatCount } from '#lib/format'
import { StaleVeil } from '#panels/results/stale-veil'

import { CHART_HEIGHT, plotDefinition, yTickLabelsClearance } from './definition'
import {
  notPlottedNote,
  notPlottedReason,
  plotPoints,
  splitByScope,
  throughputDomain,
  throughputTicks,
} from './points'
import type { NotPlottedNote, PlotPoint } from './points'

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

/**
 * The plot's caption, on one line: the axes, and how many endpoints the plot leaves out, with why in
 * a tooltip.
 */
export function ChartCaption({ note }: { note: NotPlottedNote | null }) {
  return (
    <div className="flex justify-between gap-x-4 font-mono text-[10px] leading-3.5 text-muted-foreground">
      <span className="truncate tracking-[0.04em] uppercase">
        Blend 3:1 $/M × tok/s p50 · log scales
      </span>
      {note !== null && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The note is the keyboard target for its tooltip, which names the reasons.
                tabIndex={0}
              />
            }
          >
            {note.label}
          </TooltipTrigger>
          <TooltipContent align="end">
            {note.label}: {note.reasons}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

/** The plot region's frame, which the loading skeleton shares. */
export const PLOT_REGION_CLASS = 'flex shrink-0 flex-col gap-0.5 px-(--results-inset) pb-1.5'

/** The dots, grid, and axes: rebuilt only when the catalogue or the filters change the dots. */
function PlotChart({
  ariaDescription,
  definition,
  projection,
}: {
  ariaDescription: string
  definition: ReturnType<typeof plotDefinition>
  projection: ProjectionAtom
}) {
  const { selectEndpoint } = useScopeActions()

  return (
    <Chart
      ariaDescription={ariaDescription}
      ariaLabel="Blended price against median throughput, one dot per endpoint"
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

function detail(row: EndpointRow) {
  return `${label(row)} · ${formatPrice(row.blend ?? 0)}/M · ${formatCount(row.throughput)} tok/s`
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
  projection,
  row,
  tone,
}: {
  projection: Projection
  row: EndpointRow
  tone: 'hover' | 'selection'
}) {
  const x = projection.x(row.blend ?? 0)
  const y = projection.y(row.throughput ?? 0)
  const stroke = tone === 'selection' ? 'var(--selection)' : 'var(--foreground)'

  return (
    <g>
      <circle cx={x} cy={y} fill="var(--background)" r={5} stroke={stroke} strokeWidth={1.5} />
      <circle cx={x} cy={y} fill={stroke} r={2} />
    </g>
  )
}

function MarkerLabel({
  projection,
  row,
  tone,
}: {
  projection: Projection
  row: EndpointRow
  tone: 'hover' | 'selection'
}) {
  const x = projection.x(row.blend ?? 0)
  const y = projection.y(row.throughput ?? 0)

  return (
    <div
      className={`${labelClass} ${tone === 'selection' ? 'text-selection' : 'text-foreground'}`}
      style={labelPlacement(x, y, projection)}
    >
      {tone === 'hover' ? detail(row) : label(row)}
    </div>
  )
}

/** A row's place on the plot, or null when it has none: free, unpriced, or without throughput. */
function plottedRow(row: EndpointRow | undefined): EndpointRow | null {
  return row !== undefined && notPlottedReason(row) === null ? row : null
}

/**
 * The frame, the selected endpoint's ring and label, and the hovered endpoint's ring and tooltip. It
 * reads hover and selection itself, so they re-render only this, never the chart under it.
 */
function PlotOverlay({
  captionInset,
  projection: atom,
}: {
  captionInset: number
  projection: ProjectionAtom
}) {
  const projection = useSelector(atom)
  const { byId } = useSnapshot()
  const endpoint = useSelectedId()
  const hoveredId = useHoveredEndpointId()

  if (projection === null) {
    return null
  }

  const selected = plottedRow(endpoint === undefined ? undefined : byId.get(endpoint))
  const hovered = plottedRow(hoveredId === null ? undefined : byId.get(hoveredId))
  const hoverIsSelection = hovered !== null && hovered.id === selected?.id

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
        {selected !== null && <Marker projection={projection} row={selected} tone="selection" />}
        {hovered !== null && !hoverIsSelection && (
          <Marker projection={projection} row={hovered} tone="hover" />
        )}
      </svg>
      {/* Which way is better, in the corner it points to, clear of the y tick labels. */}
      <span
        className="absolute font-mono text-[10px] leading-3.5 text-muted-foreground"
        style={{ left: projection.plot.left + captionInset, top: projection.plot.top + 2 }}
      >
        ↖ cheaper and faster
      </span>
      {selected !== null && !hovered && (
        <MarkerLabel projection={projection} row={selected} tone="selection" />
      )}
      {hovered !== null && (
        <MarkerLabel
          projection={projection}
          row={hovered}
          tone={hoverIsSelection ? 'selection' : 'hover'}
        />
      )}
    </div>
  )
}

function PricePlot() {
  const { rows } = useSnapshot()
  const { notPlotted, points } = useMemo(() => plotPoints(rows), [rows])

  const {
    split: { inScope, outOfScope },
    stale,
  } = useScopeSplit(points)

  const domain = useMemo(() => throughputDomain(points), [points])

  const definition = useMemo(
    () => plotDefinition({ inScope, outOfScope, throughputDomain: domain }),
    [inScope, outOfScope, domain],
  )

  const projection = useMemo(() => createAtom<Projection | null>(null), [])
  const description = `${formatCount(points.length)} of ${formatCount(rows.length)} endpoints plotted, ${formatCount(inScope.length)} of them in the current filters. Blended price from $0.01 to $100 per million tokens on a log scale, against median throughput from ${formatCount(domain[0])} to ${formatCount(domain[1])} tokens per second on a log scale.`

  return (
    <div className={PLOT_REGION_CLASS}>
      <ChartCaption note={notPlottedNote(notPlotted)} />
      <div aria-busy={stale} className="relative">
        <PlotChart ariaDescription={description} definition={definition} projection={projection} />
        {/* Only the dots dim: the selection and hover rings in the overlay follow the pointer, not the filters. */}
        <StaleVeil className="inset-0" stale={stale} />
        <PlotOverlay
          captionInset={yTickLabelsClearance(throughputTicks([...domain]))}
          projection={projection}
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
