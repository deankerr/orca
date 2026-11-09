import { defineChart, dot } from '@tanstack/charts'

import { formatCount } from '#lib/format'

import { insetLogScale } from './inset-scale'
import { PRICE_DOMAIN, PRICE_GRID, throughputTicks } from './points'
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
 * How far in from the plot's edge the ends of both scales sit, in pixels: the largest dot's radius
 * rounded up, the frame line's own pixel (it is drawn inside the edge), and a pixel of air. A dot at the
 * end of a domain (the cheapest, priciest, fastest or slowest) then sits wholly inside the frame, at any
 * width.
 */
const DOT_INSET = Math.ceil(Math.max(DIM_RADIUS, BRIGHT_RADIUS)) + 2

/** `$0.01`, `$0.10`, `$1`, `$10`, `$100`. */
function formatPriceTick(price: number): string {
  return price < 1 ? `$${price.toFixed(2)}` : `$${price}`
}

/** The end labels sit inside the frame, so `$0.01` starts at its left edge and `$100` ends at its right. */
function priceLabelAnchor(price: number): 'start' | 'middle' | 'end' {
  if (price === PRICE_DOMAIN[0]) {
    return 'start'
  }

  return price === PRICE_DOMAIN[1] ? 'end' : 'middle'
}

/** The end labels step back out by the scale's inset, so they still start and end at the frame's edges. */
function priceLabelDx(price: number): number {
  if (price === PRICE_DOMAIN[0]) {
    return -DOT_INSET
  }

  return price === PRICE_DOMAIN[1] ? DOT_INSET : 0
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
  /** Dots inside the filters, drawn bright and on top. */
  inScope: readonly PlotPoint[]
  /** Dots outside the filters, drawn dim and underneath. */
  outOfScope: readonly PlotPoint[]
  throughputDomain: readonly [number, number]
}

/**
 * The scatter of blended price against p50 throughput. It holds only what the filters change: the two
 * dot layers. Hover and selection are drawn above it, so changing them never rebuilds this definition.
 */
export function plotDefinition({ inScope, outOfScope, throughputDomain }: PlotDefinitionInput) {
  return defineChart({
    focusRing: false,
    // Hover and selection draw above the chart, and the Table owns keyboard selection.
    keyboard: false,
    margin: { bottom: LABEL_ROOM, left: 1, right: 1, top: 1 },
    marks: [
      dot(outOfScope, {
        fill: DIM_FILL,
        id: 'out-of-scope',
        key: 'id',
        r: DIM_RADIUS,
        x: 'price',
        y: 'throughput',
      }),
      dot(inScope, {
        fill: BRIGHT_FILL,
        id: 'in-scope',
        key: 'id',
        r: BRIGHT_RADIUS,
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
            anchor: ({ value }: { value: number }) => priceLabelAnchor(value),
            dx: ({ value }: { value: number }) => priceLabelDx(value),
            thin: { keep: PRICE_DOMAIN },
          },
          ticks: { format: formatPriceTick, size: 0, values: PRICE_GRID },
        },
        grid,
        scale: insetLogScale(PRICE_DOMAIN, DOT_INSET),
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
            values: throughputTicks([...throughputDomain]),
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
