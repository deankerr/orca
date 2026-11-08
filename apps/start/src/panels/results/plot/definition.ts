import { defineChart, dot } from '@tanstack/charts'
import { scaleLog } from 'd3-scale'

import { formatCount } from '#lib/format'

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

const grid = { stroke: 'var(--border-solid)' }

/** The y tick labels' inset from the plot's left edge. */
export const Y_TICK_LABEL_DX = 4

/** A tick label character's advance: the chart's tick labels are 11px Geist Mono. */
export const TICK_LABEL_CHAR_WIDTH = 7

/**
 * Where text in the plot's top-left corner starts, from the plot's left edge, so it clears the y tick
 * labels whatever their heights: past the widest label (`1,000` is five characters) and a gap.
 */
export function yTickLabelsClearance(ticks: readonly number[]): number {
  const characters = Math.max(0, ...ticks.map((tick) => formatCount(tick).length))

  return Y_TICK_LABEL_DX + characters * TICK_LABEL_CHAR_WIDTH + 2 * Y_TICK_LABEL_DX
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
        r: 1.5,
        x: 'price',
        y: 'throughput',
      }),
      dot(inScope, {
        fill: BRIGHT_FILL,
        id: 'in-scope',
        key: 'id',
        r: 1.75,
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
            thin: { keep: PRICE_DOMAIN },
          },
          ticks: { format: formatPriceTick, size: 0, values: PRICE_GRID },
        },
        grid,
        scale: scaleLog().domain([...PRICE_DOMAIN]),
      },
      y: {
        axis: {
          line: false,
          tickLabels: { anchor: 'start', dx: Y_TICK_LABEL_DX, dy: -6 },
          ticks: {
            format: (value: number) => formatCount(value),
            size: 0,
            values: throughputTicks([...throughputDomain]),
          },
        },
        grid,
        scale: scaleLog().domain([...throughputDomain]),
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
