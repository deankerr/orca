import { isCostRaisedByNoCache, workloadCost } from '@orca/pricing'
import type { Workload } from '@orca/pricing'

import type { EndpointRow } from '#endpoints/snapshot'

/** What the plot reads of an endpoint: its cost under the current workload, its throughput, and whether its lack of a cache raises that cost. */
export interface PlottableRow {
  /** Endpoint UUID, as in `EndpointRow.id`. */
  id: string
  /** Workload cost in $/M; null when the endpoint has no input or output rate. */
  cost: number | null
  throughput: number | null
  /** Whether the endpoint's lack of a cache raises its cost under the workload; see `isCostRaisedByNoCache`. */
  noCache: boolean
}

/** An endpoint row's plottable form under a workload. */
export function plottableRow(
  row: Pick<EndpointRow, 'cacheRead' | 'cacheWrite' | 'id' | 'input' | 'output' | 'throughput'>,
  workload: Workload,
): PlottableRow {
  return {
    cost: workloadCost(row, workload),
    id: row.id,
    noCache: isCostRaisedByNoCache(row, workload),
    throughput: row.throughput,
  }
}

/** One endpoint that can stand on both log axes. */
export interface PlotPoint {
  /** Endpoint UUID, as in `EndpointRow.id`. */
  id: string
  /** Workload cost in $/M, above zero. */
  price: number
  /** Median tokens per second, above zero. */
  throughput: number
  /** Whether the endpoint's lack of a cache raises its cost; those that do are drawn as rings. */
  noCache: boolean
}

/** Why an endpoint cannot be placed on the plot. A row counts under the first reason that applies. */
export type NotPlottedReason = 'noPrice' | 'free' | 'noThroughput'

/** The reason a row has no place on log axes, or null when it has one. */
export function notPlottedReason(
  row: Pick<PlottableRow, 'cost' | 'throughput'>,
): NotPlottedReason | null {
  const { cost, throughput } = row

  if (cost === null) {
    return 'noPrice'
  }

  if (cost === 0) {
    return 'free'
  }

  if (throughput === null || throughput <= 0) {
    return 'noThroughput'
  }

  return null
}

/** Every row that fits both log axes, in row order. */
export function plotPoints(rows: readonly PlottableRow[]): PlotPoint[] {
  return rows.flatMap((row) =>
    notPlottedReason(row) === null
      ? // `notPlottedReason` has checked both values, but not narrowed them.
        [
          {
            id: row.id,
            noCache: row.noCache,
            price: row.cost ?? 0,
            throughput: row.throughput ?? 0,
          },
        ]
      : [],
  )
}

/** 1, 2, 5 × 10ⁿ: the steps an axis bound can round to. */
const STEPS = [1, 2, 5, 10]

/** A product of a step and a power of ten, without the float noise of the multiplication. */
const clean = (value: number): number => Number(value.toPrecision(12))

function stepBelow(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const mantissa = value / magnitude

  return clean((STEPS.findLast((step) => step <= mantissa * (1 + 1e-9)) ?? 1) * magnitude)
}

function stepAbove(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const mantissa = value / magnitude

  return clean((STEPS.find((step) => step >= mantissa * (1 - 1e-9)) ?? 10) * magnitude)
}

/**
 * The range of positive values, rounded outward to 1, 2, 5 steps. A value on a step still ends the
 * axis, so the scale's inset (`DOT_INSET`) is what keeps that dot inside the frame. `empty` is used
 * when there are no values, so the axes still draw.
 *
 * Always `0 < low < high < Infinity`, since a log axis needs it. At the ends of the double range
 * rounding or widening may not be representable (a step above `1.7e308` is `Infinity`; one below
 * `Number.MIN_VALUE` is 0): the bound is then the data's own end, and a single value widens as far as
 * `Number.MIN_VALUE` and `Number.MAX_VALUE` allow.
 */
function roundedDomain(values: readonly number[], empty: readonly [number, number]) {
  if (values.length === 0) {
    return empty
  }

  let low = Infinity
  let high = -Infinity

  for (const value of values) {
    low = Math.min(low, value)
    high = Math.max(high, value)
  }

  const steppedLow = stepBelow(low)
  const steppedHigh = stepAbove(high)

  // Outward by at most the steps' own tolerance; anything else is a rounding that did not survive.
  const lowBound =
    Number.isFinite(steppedLow) && steppedLow > 0 && steppedLow <= low * (1 + 1e-9)
      ? steppedLow
      : low

  const highBound =
    Number.isFinite(steppedHigh) && steppedHigh >= high * (1 - 1e-9) ? steppedHigh : high

  // A single value, or equal rounding, still needs a span to draw.
  return lowBound === highBound
    ? ([
        Math.max(lowBound / 2, Number.MIN_VALUE),
        Math.min(highBound * 2, Number.MAX_VALUE),
      ] as const)
    : ([lowBound, highBound] as const)
}

/** Used when no point has a throughput, so the axes still draw. */
const EMPTY_THROUGHPUT_DOMAIN = [1, 1000] as const

/** Used when no point has a cost, so the axes still draw. */
const EMPTY_PRICE_DOMAIN = [0.01, 100] as const

/**
 * The throughput axis: the data's range, rounded outward to a 1, 2, 5 step.
 * It spans the whole catalogue, not the filtered rows, so filtering moves dots without moving the axis.
 */
export function throughputDomain(points: readonly PlotPoint[]): readonly [number, number] {
  return roundedDomain(
    points.map((point) => point.throughput),
    EMPTY_THROUGHPUT_DOMAIN,
  )
}

/**
 * The cost axis, in workload cost $/M: the range of plottable costs, rounded outward to a 1, 2, 5
 * step. Like the throughput axis it spans the whole catalogue, so filtering moves dots without moving
 * the axis, and it follows the workload, so every dot is on scale under any of them.
 */
export function priceDomain(points: readonly PlotPoint[]): readonly [number, number] {
  return roundedDomain(
    points.map((point) => point.price),
    EMPTY_PRICE_DOMAIN,
  )
}

/** Axis ticks: each power of ten strictly inside the domain, since the frame marks its ends. */
export function decadeTicks([low, high]: readonly [number, number]): number[] {
  const ticks: number[] = []

  for (
    let power = Math.floor(Math.log10(low) + 1e-9) + 1;
    Number(`1e${power}`) < high * (1 - 1e-9);
    power += 1
  ) {
    ticks.push(Number(`1e${power}`))
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

/** Points split by whether the endpoint's lack of a cache raises its cost: `filled` are drawn as dots, `rings` as rings. */
export function splitByNoCache(points: readonly PlotPoint[]) {
  return {
    filled: points.filter((point) => !point.noCache),
    rings: points.filter((point) => point.noCache),
  }
}
