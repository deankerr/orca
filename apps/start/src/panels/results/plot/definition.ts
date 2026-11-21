import { formatNumber, formatPrice } from '@orca/backend/numbers'
import { defineChart, dot } from '@tanstack/charts'

import { formatCount } from '#lib/format'

import { insetLogScale } from './inset-scale'
import { decadeTicks, splitByNoCache } from './points'
import type { PlotPoint } from './points'

/** The plotting area's height in pixels; the x tick labels sit below it. */
const PLOT_HEIGHT = 112

/** Room under the plot for the x tick labels. */
const LABEL_ROOM = 18

/** Total chart height: the plot, its frame, and the x tick labels. */
export const CHART_HEIGHT = PLOT_HEIGHT + LABEL_ROOM

/** A dot this close (in pixels) to the pointer is the one under it. Dots are tiny and 1,500 crowd the plot. */
const HIT_RADIUS = 10

const DIM_FILL = 'var(--border-solid)'
const BRIGHT_FILL = 'var(--foreground)'

/** The dots' radii in pixels. They have no stroke, so a dot's reach is its radius. */
const DIM_RADIUS = 1.5
const BRIGHT_RADIUS = 1.75

/**
 * The rings' radii and stroke width in pixels, for endpoints whose lack of a cache raises their cost. A ring's stroke is centred
 * on its radius, so it reaches half the stroke past it. A ring is a little larger than a dot, enough
 * for its hole to show, but its thin stroke keeps it no heavier than the dots around it.
 */
const DIM_RING_RADIUS = 1.75
const BRIGHT_RING_RADIUS = 2
const RING_STROKE_WIDTH = 1

/**
 * How far in from the plot's edge the ends of both scales sit, in pixels: the largest mark's reach
 * rounded up, the frame line's own pixel (it is drawn inside the edge), and a pixel of air. A mark at the
 * end of a domain (the cheapest, priciest, fastest or slowest) then sits wholly inside the frame, at any
 * width.
 */
const DOT_INSET =
  Math.ceil(
    Math.max(
      DIM_RADIUS,
      BRIGHT_RADIUS,
      DIM_RING_RADIUS + RING_STROKE_WIDTH / 2,
      BRIGHT_RING_RADIUS + RING_STROKE_WIDTH / 2,
    ),
  ) + 2

/**
 * A cost tick or end label: whole dollars bare (`$1`, `$10`, `$1,000`), cents at minimum below that
 * (`$0.10`), and small values at their first significant digits (`$0.005`).
 */
export function formatPriceTick(price: number): string {
  return Number.isInteger(price)
    ? `$${formatNumber(price) ?? price}`
    : (formatPrice(price) ?? `$${price}`)
}

/** The end labels sit inside the frame, so the low end starts at its left edge and the high end ends at its right. */
function priceLabelAnchor(price: number, [low, high]: readonly [number, number]) {
  if (price === low) {
    return 'start'
  }

  return price === high ? 'end' : 'middle'
}

/** The end labels step back out by the scale's inset, so they still start and end at the frame's edges. */
function priceLabelDx(price: number, [low, high]: readonly [number, number]): number {
  if (price === low) {
    return -DOT_INSET
  }

  return price === high ? DOT_INSET : 0
}

/**
 * The grid. The chart draws grid lines at 0.11 opacity by default, which both themes lose against the
 * background. `--muted-foreground` at 0.25 lands just under the plot frame's `--border-solid` in each
 * theme (lightness about 0.29 against 0.32 in dark, 0.89 against 0.87 in light).
 */
const grid = { stroke: 'var(--muted-foreground)', strokeOpacity: 0.25 }

/** The y tick labels' gap from the plot's left edge (the frame's line). */
export const Y_TICK_LABEL_DX = 3

/** The gap between the widest y tick label and the caption in the plot's corner. */
const CAPTION_GAP = 8

/** A tick label character's advance: the chart's tick labels are 11px Geist Mono. */
export const TICK_LABEL_CHAR_WIDTH = 7

/**
 * Where text in the plot's top-left corner starts, from the plot's left edge, so it clears the y tick
 * labels whatever their heights: past the widest label (`1,000` is five characters) and a gap.
 */
export function yTickLabelsClearance(ticks: readonly number[]): number {
  const characters = Math.max(0, ...ticks.map((tick) => formatCount(tick).length))

  return Y_TICK_LABEL_DX + characters * TICK_LABEL_CHAR_WIDTH + CAPTION_GAP
}

export interface PlotDefinitionInput {
  /** Points inside the filters, drawn bright and on top. */
  inScope: readonly PlotPoint[]
  /** Points outside the filters, drawn dim and underneath. */
  outOfScope: readonly PlotPoint[]
  /** The cost axis's range in $/M, from `priceDomain`. */
  priceDomain: readonly [number, number]
  throughputDomain: readonly [number, number]
}

/**
 * The scatter of workload cost against p50 throughput. Endpoints whose lack of a cache raises their cost are rings and
 * the rest are filled dots, each in a bright layer inside the filters and a dim one outside them. It holds
 * only what the filters and the workload change: the points and the axes. Hover and selection are
 * drawn above it, so changing them never rebuilds this definition.
 */
export function plotDefinition({
  inScope,
  outOfScope,
  priceDomain,
  throughputDomain,
}: PlotDefinitionInput) {
  const dim = splitByNoCache(outOfScope)
  const bright = splitByNoCache(inScope)

  return defineChart({
    focusRing: false,
    // Hover and selection draw above the chart, and the Table owns keyboard selection.
    keyboard: false,
    margin: { bottom: LABEL_ROOM, left: 1, right: 1, top: 1 },
    marks: [
      dot(dim.filled, {
        fill: DIM_FILL,
        id: 'out-of-scope',
        key: 'id',
        r: DIM_RADIUS,
        x: 'price',
        y: 'throughput',
      }),
      dot(dim.rings, {
        fill: 'none',
        id: 'out-of-scope-rings',
        key: 'id',
        r: DIM_RING_RADIUS,
        stroke: DIM_FILL,
        strokeWidth: RING_STROKE_WIDTH,
        x: 'price',
        y: 'throughput',
      }),
      dot(bright.filled, {
        fill: BRIGHT_FILL,
        id: 'in-scope',
        key: 'id',
        r: BRIGHT_RADIUS,
        x: 'price',
        y: 'throughput',
      }),
      dot(bright.rings, {
        fill: 'none',
        id: 'in-scope-rings',
        key: 'id',
        r: BRIGHT_RING_RADIUS,
        stroke: BRIGHT_FILL,
        strokeWidth: RING_STROKE_WIDTH,
        x: 'price',
        y: 'throughput',
      }),
    ],
    maxFocusDistance: HIT_RADIUS,
    scales: {
      x: {
        axis: {
          line: false,
          tickLabels: {
            anchor: ({ value }: { value: number }) => priceLabelAnchor(value, priceDomain),
            dx: ({ value }: { value: number }) => priceLabelDx(value, priceDomain),
            thin: { keep: priceDomain },
          },
          ticks: { format: formatPriceTick, size: 0, values: decadeTicks(priceDomain) },
        },
        grid,
        scale: insetLogScale(priceDomain, DOT_INSET),
      },
      y: {
        axis: {
          line: false,
          tickLabels: { anchor: 'start', dx: Y_TICK_LABEL_DX, dy: -6 },
          // No tick padding (the chart's default 4 is subtracted from the label's x), so `dx` is the gap.
          ticks: {
            format: (value: number) => formatCount(value),
            padding: 0,
            size: 0,
            values: decadeTicks(throughputDomain),
          },
        },
        grid,
        scale: insetLogScale(throughputDomain, DOT_INSET),
      },
    },
    theme: {
      background: 'transparent',
      foreground: 'var(--foreground)',
      grid: 'var(--border-solid)',
      muted: 'var(--muted-foreground)',
    },
    tooltip: false,
  })
}
