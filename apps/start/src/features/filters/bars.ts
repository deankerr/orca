import type { Histogram } from '#features/endpoints/filters'

import type { BoundFacet } from './format'

/** Whether a bound caps the value (`max`) or floors it (`min`). */
export type BoundDirection = 'max' | 'min'

export const BOUND_DIRECTIONS: Record<BoundFacet, BoundDirection> = {
  maxInput: 'max',
  minContext: 'min',
  minTps: 'min',
}

/**
 * The bounds a histogram can set, one per bin, in bin order. Bin `i` covers values from
 * `thresholds[i - 1]` to `thresholds[i]`, so a maximum that keeps bin `i` is its upper threshold and a
 * minimum that keeps it is its lower threshold. The open end has no threshold: no bound.
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
  /** The bound clicking this bar sets; undefined clears it. */
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

/** The stop nearest a bound, for a bound that came from the URL and sits between thresholds. */
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

/** The stop one step along, clamped to the ends; `delta` is +1 toward higher values. */
export function stepStop(
  stops: readonly (number | undefined)[],
  bound: number | undefined,
  delta: -1 | 1,
): number | undefined {
  const index = nearestStopIndex(stops, bound)

  return stops[Math.min(Math.max(index + delta, 0), stops.length - 1)]
}
