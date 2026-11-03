import type { Histogram } from '#endpoints/filtering'

import type { BoundFacet } from './bound-labels'

/** Whether a bound caps the value (`max`) or floors it (`min`). */
export type BoundDirection = 'max' | 'min'

export const BOUND_DIRECTIONS: Record<BoundFacet, BoundDirection> = {
  maxInput: 'max',
  minContext: 'min',
  minTps: 'min',
}

/**
 * The bounds a histogram's bars set, one per bin, in bin order. Bin `i` covers values from
 * `thresholds[i - 1]` to `thresholds[i]`, so the maximum that keeps bins up to `i` is its upper
 * threshold and the minimum that keeps bins from `i` up is its lower threshold. The bar at the open end
 * has no threshold: it sets no bound.
 */
export function boundStops(
  thresholds: readonly number[],
  direction: BoundDirection,
): (number | undefined)[] {
  return direction === 'max' ? [...thresholds, undefined] : [undefined, ...thresholds]
}

export interface Bar {
  count: number
  /** Share of the tallest bin, from 0 to 1. */
  share: number
  /** Whether the bin lies inside the current bound. */
  within: boolean
  /** The bound this bar stands for, which pressing it sets (see `pressedBound`); undefined is none. */
  stop: number | undefined
}

/** Bars for a histogram. Bars the bound keeps, wholly or partly, are within. */
export function histogramBars(
  { counts, thresholds }: Pick<Histogram, 'counts' | 'thresholds'>,
  direction: BoundDirection,
  bound: number | undefined,
): Bar[] {
  const stops = boundStops(thresholds, direction)
  const tallest = Math.max(...counts, 0)

  return counts.map((count, index) => {
    const lower = thresholds[index - 1]
    const upper = thresholds[index]
    let within = true

    if (bound !== undefined) {
      within = direction === 'max' ? (lower ?? -Infinity) < bound : (upper ?? Infinity) > bound
    }

    return { count, share: tallest === 0 ? 0 : count / tallest, stop: stops[index], within }
  })
}

/**
 * The stop a bound sits on, or the stop nearest it when it came from the URL between thresholds. It
 * is the bar that takes the row's tab stop.
 */
export function nearestStopIndex(
  stops: readonly (number | undefined)[],
  bound: number | undefined,
): number {
  if (bound === undefined) {
    return stops.indexOf(undefined)
  }

  let nearest = -1
  let distance = Infinity

  for (const [index, stop] of stops.entries()) {
    if (stop !== undefined && Math.abs(stop - bound) < distance) {
      nearest = index
      distance = Math.abs(stop - bound)
    }
  }

  return nearest
}

/**
 * The bound a press on a bar with `stop` sets: the stop's exact threshold, or no bound when the bound
 * already sits on that stop. A bound between thresholds sits on no stop, so any press sets a threshold.
 */
export function pressedBound(
  stop: number | undefined,
  bound: number | undefined,
): number | undefined {
  return stop === bound ? undefined : stop
}

/**
 * How many endpoints a bound on a stop keeps. No bound keeps them all, including those with no value.
 * A bound between thresholds would count the bin it cuts through whole.
 */
export function keptCount(
  histogram: Pick<Histogram, 'counts' | 'missing' | 'thresholds'>,
  direction: BoundDirection,
  bound: number | undefined,
): number {
  let kept = bound === undefined ? histogram.missing : 0

  for (const { count, within } of histogramBars(histogram, direction, bound)) {
    if (within) {
      kept += count
    }
  }

  return kept
}
