import type { ConfiguredScaleLike } from '@tanstack/charts'
import { scaleLog } from 'd3-scale'

/**
 * A log scale whose pixel range is pulled in by `inset` at both ends, so a value at either end of the
 * domain lands `inset` pixels inside the plot's frame instead of on it. The chart assigns the plot's
 * pixel range (it owns the responsive size), and the inset applies on top of that, so it holds at every
 * width. Ticks and grid lines map through the same scale, so they stay aligned with the dots.
 */
export function insetLogScale(
  domain: readonly [number, number],
  inset: number,
): ConfiguredScaleLike<number> {
  const scale = scaleLog().domain([...domain])
  // The range the chart last assigned, before the inset.
  let assigned: [number, number] = [0, 1]

  const self: ConfiguredScaleLike<number> = Object.assign((value: number) => scale(value), {
    copy: () => {
      const clone = insetLogScale(domain, inset)

      return clone.range(assigned)
    },
    domain: () => scale.domain(),
    invert: (position: number) => scale.invert(position),
    range: (values: Iterable<number>) => {
      const [start = 0, end = 1] = values

      assigned = [start, end]
      // A y range runs bottom to top, so the inset moves toward the other end whichever way it points.
      const direction = Math.sign(end - start)

      scale.range([start + direction * inset, end - direction * inset])

      return self
    },
    tickFormat: (count: number) => scale.tickFormat(count),
    ticks: (count: number) => scale.ticks(count),
  })

  return self
}
