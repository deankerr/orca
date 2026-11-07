import { describe, expect, it } from 'vitest'

import {
  PRICE_DOMAIN,
  notPlottedNote,
  notPlottedReason,
  plotPoints,
  splitByScope,
  throughputDomain,
  throughputTicks,
} from './points'
import type { PlotPoint, PlottableRow } from './points'

const row = (id: string, blend: number | null, throughput: number | null): PlottableRow => ({
  blend,
  id,
  throughput,
})

const point = (id: string, throughput: number): PlotPoint => ({ id, price: 1, throughput })

describe('notPlottedReason', () => {
  it('places a priced endpoint with throughput inside the price axis', () => {
    expect(notPlottedReason(row('a', 0.38, 142))).toBeNull()
    expect(notPlottedReason(row('a', PRICE_DOMAIN[0], 1))).toBeNull()
    expect(notPlottedReason(row('a', PRICE_DOMAIN[1], 1))).toBeNull()
  })

  it('cannot place a free endpoint on a log axis', () => {
    expect(notPlottedReason(row('a', 0, 100))).toBe('free')
  })

  it('cannot place an endpoint without a price', () => {
    expect(notPlottedReason(row('a', null, 100))).toBe('noPrice')
  })

  it('cannot place an endpoint without throughput, or with none above zero', () => {
    expect(notPlottedReason(row('a', 1, null))).toBe('noThroughput')
    expect(notPlottedReason(row('a', 1, 0))).toBe('noThroughput')
  })

  it('leaves off a price outside the axis', () => {
    expect(notPlottedReason(row('a', 0.009, 50))).toBe('offscale')
    expect(notPlottedReason(row('a', 100.5, 50))).toBe('offscale')
  })

  it('names the first reason when several apply', () => {
    expect(notPlottedReason(row('a', 0, null))).toBe('free')
    expect(notPlottedReason(row('a', null, null))).toBe('noPrice')
    expect(notPlottedReason(row('a', 0.001, null))).toBe('noThroughput')
  })
})

describe('plotPoints', () => {
  const result = plotPoints([
    row('kept', 0.38, 142),
    row('free', 0, 80),
    row('slow', 2, null),
    row('unpriced', null, 40),
    row('cheap', 0.001, 40),
    row('also-kept', 12, 9),
  ])

  it('keeps the plottable rows in row order, with their blend and throughput', () => {
    expect(result.points).toEqual([
      { id: 'kept', price: 0.38, throughput: 142 },
      { id: 'also-kept', price: 12, throughput: 9 },
    ])
  })

  it('counts every other row once, under its reason', () => {
    expect(result.notPlotted).toEqual({ free: 1, noPrice: 1, noThroughput: 1, offscale: 1 })
  })

  it('accounts for every row', () => {
    const counted = Object.values(result.notPlotted).reduce((sum, count) => sum + count, 0)

    expect(result.points.length + counted).toBe(6)
  })

  it('handles an empty catalogue', () => {
    expect(plotPoints([])).toEqual({
      notPlotted: { free: 0, noPrice: 0, noThroughput: 0, offscale: 0 },
      points: [],
    })
  })
})

describe('notPlottedNote', () => {
  const none = { free: 0, noPrice: 0, noThroughput: 0, offscale: 0 }

  it('is null when every endpoint is plotted', () => {
    expect(notPlottedNote(none)).toBeNull()
  })

  it('totals the count and names one reason', () => {
    expect(notPlottedNote({ ...none, free: 3 })).toEqual({
      label: '3 not plotted',
      reasons: 'free',
    })
  })

  it('joins two reasons with "or"', () => {
    expect(notPlottedNote({ ...none, free: 14, noThroughput: 184 })).toEqual({
      label: '198 not plotted',
      reasons: 'free or no tok/s',
    })
  })

  it('joins more reasons with commas and a final "or"', () => {
    expect(notPlottedNote({ free: 14, noPrice: 2, noThroughput: 184, offscale: 1 })).toEqual({
      label: '201 not plotted',
      reasons: 'free, no price, no tok/s or off scale',
    })
  })

  it('groups thousands', () => {
    expect(notPlottedNote({ ...none, noThroughput: 1234 })).toEqual({
      label: '1,234 not plotted',
      reasons: 'no tok/s',
    })
  })
})

describe('throughputDomain', () => {
  it('rounds the data range outward to 1, 2, 5 steps', () => {
    expect(throughputDomain([point('a', 7), point('b', 4800)])).toEqual([5, 5000])
    expect(throughputDomain([point('a', 0.7), point('b', 130)])).toEqual([0.5, 200])
    expect(throughputDomain([point('a', 12), point('b', 95)])).toEqual([10, 100])
  })

  it('keeps a bound that is already a step', () => {
    expect(throughputDomain([point('a', 20), point('b', 500)])).toEqual([20, 500])
  })

  it('widens a single value so it still has a span', () => {
    expect(throughputDomain([point('a', 100)])).toEqual([50, 200])
  })

  it('falls back to a default span with no points', () => {
    expect(throughputDomain([])).toEqual([1, 1000])
  })
})

describe('throughputTicks', () => {
  it('lists the powers of ten strictly inside the domain', () => {
    expect(throughputTicks([1, 10_000])).toEqual([10, 100, 1000])
    expect(throughputTicks([5, 5000])).toEqual([10, 100, 1000])
    expect(throughputTicks([0.5, 200])).toEqual([1, 10, 100])
  })

  it('has no tick when the domain holds no power of ten', () => {
    expect(throughputTicks([20, 80])).toEqual([])
  })
})

describe('splitByScope', () => {
  const points = [point('a', 1), point('b', 2), point('c', 3)]

  it('splits the points by membership, keeping order', () => {
    expect(splitByScope(points, new Set(['a', 'c']))).toEqual({
      inScope: [points[0], points[2]],
      outOfScope: [points[1]],
    })
  })

  it('puts everything out of scope when no id matches', () => {
    expect(splitByScope(points, new Set(['z']))).toEqual({ inScope: [], outOfScope: points })
  })

  it('ignores scope ids that have no point', () => {
    expect(splitByScope(points, new Set(['a', 'b', 'c', 'free-one'])).outOfScope).toEqual([])
  })
})
