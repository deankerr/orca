import type { EndpointRow } from '#endpoints/snapshot'

/** The price axis, in blended $/M. Fixed so the axis reads the same however the filters narrow the rows. */
export const PRICE_DOMAIN = [0.01, 100] as const

/** Price grid lines and ticks: each decade inside the axis. The frame marks its ends, which are labelled. */
export const PRICE_GRID = [0.1, 1, 10] as const

/** The fields of an endpoint row the plot reads. */
export type PlottableRow = Pick<EndpointRow, 'blend' | 'id' | 'throughput'>

/** One endpoint that can stand on both log axes. */
export interface PlotPoint {
  /** Endpoint UUID, as in `EndpointRow.id`. */
  id: string
  /** Blended $/M, within `PRICE_DOMAIN`. */
  price: number
  /** Median tokens per second, above zero. */
  throughput: number
}

/** Why an endpoint cannot be placed on the plot. A row counts under the first reason that applies. */
export type NotPlottedReason = 'noPrice' | 'free' | 'noThroughput' | 'offscale'

export type NotPlottedCounts = Record<NotPlottedReason, number>

export interface PlotPoints {
  points: PlotPoint[]
  notPlotted: NotPlottedCounts
}

/** The reason a row has no place on log axes, or null when it has one. */
export function notPlottedReason(
  row: Pick<PlottableRow, 'blend' | 'throughput'>,
): NotPlottedReason | null {
  const { blend, throughput } = row

  if (blend === null) {
    return 'noPrice'
  }

  if (blend === 0) {
    return 'free'
  }

  if (throughput === null || throughput <= 0) {
    return 'noThroughput'
  }

  if (blend < PRICE_DOMAIN[0] || blend > PRICE_DOMAIN[1]) {
    return 'offscale'
  }

  return null
}

/** Every row that fits both log axes, in row order, and a count of the rest by reason. */
export function plotPoints(rows: readonly PlottableRow[]): PlotPoints {
  const points: PlotPoint[] = []
  const notPlotted: NotPlottedCounts = { free: 0, noPrice: 0, noThroughput: 0, offscale: 0 }

  for (const row of rows) {
    const reason = notPlottedReason(row)

    if (reason === null) {
      // `notPlottedReason` has checked both values, but not narrowed them.
      points.push({ id: row.id, price: row.blend ?? 0, throughput: row.throughput ?? 0 })
    } else {
      notPlotted[reason] += 1
    }
  }

  return { notPlotted, points }
}

const reasonText: Record<NotPlottedReason, string> = {
  free: 'free',
  noPrice: 'no price',
  noThroughput: 'no tok/s',
  offscale: 'off scale',
}

const reasonOrder: readonly NotPlottedReason[] = ['free', 'noPrice', 'noThroughput', 'offscale']

/** The caption for endpoints left off the plot: `17 not plotted: free or no throughput`. Null when all fit. */
export function notPlottedNote(counts: NotPlottedCounts): string | null {
  const total = reasonOrder.reduce((sum, reason) => sum + counts[reason], 0)

  if (total === 0) {
    return null
  }

  const reasons = reasonOrder.flatMap((reason) => (counts[reason] > 0 ? [reasonText[reason]] : []))

  const last = reasons.pop()
  const list = reasons.length === 0 ? last : `${reasons.join(', ')} or ${last}`

  return `${total.toLocaleString('en')} not plotted: ${list}`
}

/** 1, 2, 5 × 10ⁿ: the steps a throughput bound can round to. */
const STEPS = [1, 2, 5, 10]

function stepBelow(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const mantissa = value / magnitude

  return (STEPS.findLast((step) => step <= mantissa * (1 + 1e-9)) ?? 1) * magnitude
}

function stepAbove(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const mantissa = value / magnitude

  return (STEPS.find((step) => step >= mantissa * (1 - 1e-9)) ?? 10) * magnitude
}

/** Used when no point has a throughput, so the axes still draw. */
const EMPTY_THROUGHPUT_DOMAIN = [1, 1000] as const

/**
 * The throughput axis: the data's range, rounded outward to a 1, 2, 5 step so no dot sits on the frame.
 * It spans the whole catalogue, not the filtered rows, so filtering moves dots without moving the axis.
 */
export function throughputDomain(points: readonly PlotPoint[]): readonly [number, number] {
  if (points.length === 0) {
    return EMPTY_THROUGHPUT_DOMAIN
  }

  let low = Infinity
  let high = -Infinity

  for (const { throughput } of points) {
    low = Math.min(low, throughput)
    high = Math.max(high, throughput)
  }

  const lowBound = stepBelow(low)
  const highBound = stepAbove(high)

  // A single value, or equal rounding, still needs a span to draw.
  return lowBound === highBound ? [lowBound / 2, highBound * 2] : [lowBound, highBound]
}

/** Throughput ticks: each power of ten strictly inside the domain, since the frame marks its ends. */
export function throughputTicks([low, high]: readonly [number, number]): number[] {
  const ticks: number[] = []

  for (
    let power = Math.floor(Math.log10(low) + 1e-9) + 1;
    10 ** power < high * (1 - 1e-9);
    power += 1
  ) {
    ticks.push(10 ** power)
  }

  return ticks
}

export interface PointsByScope {
  inScope: PlotPoint[]
  outOfScope: PlotPoint[]
}

/** The points split by the filters: `inScope` ids are in the set, the rest are `outOfScope`. */
export function splitByScope(
  points: readonly PlotPoint[],
  inScopeIds: ReadonlySet<string>,
): PointsByScope {
  const inScope: PlotPoint[] = []
  const outOfScope: PlotPoint[] = []

  for (const point of points) {
    ;(inScopeIds.has(point.id) ? inScope : outOfScope).push(point)
  }

  return { inScope, outOfScope }
}
