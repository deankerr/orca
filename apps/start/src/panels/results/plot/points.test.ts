import { defaultWorkload } from '@orca/pricing'
import { describe, expect, it } from 'vitest'

import {
  decadeTicks,
  notPlottedReason,
  plotPoints,
  plottableRow,
  priceDomain,
  splitByNoCache,
  splitByScope,
  throughputDomain,
} from './points'
import type { PlotPoint, PlottableRow } from './points'

const row = (
  id: string,
  cost: number | null,
  throughput: number | null,
  noCache = false,
): PlottableRow => ({ cost, id, noCache, throughput })

const point = (id: string, throughput: number, price = 1, noCache = false): PlotPoint => ({
  id,
  noCache,
  price,
  throughput,
})

describe('notPlottedReason', () => {
  it('places a priced endpoint with throughput, at any cost above zero', () => {
    expect(notPlottedReason(row('a', 0.38, 142))).toBeNull()
    expect(notPlottedReason(row('a', 0.0004, 1))).toBeNull()
    expect(notPlottedReason(row('a', 4000, 1))).toBeNull()
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

  it('names the first reason when several apply', () => {
    expect(notPlottedReason(row('a', 0, null))).toBe('free')
    expect(notPlottedReason(row('a', null, null))).toBe('noPrice')
    expect(notPlottedReason(row('a', 0.001, null))).toBe('noThroughput')
    expect(notPlottedReason(row('a', 0.001, 0))).toBe('noThroughput')
  })
})

describe('plottableRow', () => {
  const rates = { cacheRead: 0.1, cacheWrite: null, id: 'a', input: 1, output: 5, throughput: 90 }

  it('costs a row under the workload', () => {
    expect(plottableRow(rates, { hitRate: 0, ratio: 1 })).toEqual({
      cost: 3,
      id: 'a',
      noCache: false,
      throughput: 90,
    })
    expect(plottableRow(rates, defaultWorkload).cost).toBeCloseTo(
      (100 * (0.9 * 0.1 + 0.1) + 5) / 101,
    )
  })

  it('marks a row with no cache-read rate under a workload that uses a cache, whatever its write rate', () => {
    expect(plottableRow({ ...rates, cacheRead: null }, defaultWorkload).noCache).toBe(true)
    expect(
      plottableRow({ ...rates, cacheRead: null, cacheWrite: 1.25 }, defaultWorkload).noCache,
    ).toBe(true)
    expect(plottableRow({ ...rates, cacheRead: 0 }, defaultWorkload).noCache).toBe(false)
  })

  it('marks no row at a hit rate of 0, where no endpoint uses a cache', () => {
    expect(plottableRow({ ...rates, cacheRead: null }, { hitRate: 0, ratio: 3 }).noCache).toBe(
      false,
    )
  })

  it('does not mark a free row', () => {
    expect(
      plottableRow({ ...rates, cacheRead: null, input: 0, output: 0 }, defaultWorkload).noCache,
    ).toBe(false)
  })

  it('has no cost without a price', () => {
    expect(plottableRow({ ...rates, input: null }, defaultWorkload).cost).toBeNull()
  })
})

describe('plotPoints', () => {
  it('keeps the plottable rows in row order, with their cost and throughput', () => {
    expect(
      plotPoints([
        row('kept', 0.38, 142),
        row('free', 0, 80),
        row('slow', 2, null),
        row('unpriced', null, 40),
        row('cheap', 0.001, 40),
        row('also-kept', 12, 9, true),
      ]),
    ).toEqual([
      { id: 'kept', noCache: false, price: 0.38, throughput: 142 },
      { id: 'cheap', noCache: false, price: 0.001, throughput: 40 },
      { id: 'also-kept', noCache: true, price: 12, throughput: 9 },
    ])
  })

  it('handles an empty catalogue', () => {
    expect(plotPoints([])).toEqual([])
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

describe('priceDomain', () => {
  const priced = (...prices: number[]) =>
    prices.map((price, index) => point(`p${index}`, 50, price))

  it('rounds the range of plottable costs outward to 1, 2, 5 steps', () => {
    expect(priceDomain(priced(0.38, 61.2))).toEqual([0.2, 100])
    expect(priceDomain(priced(0.0034, 7.5))).toEqual([0.002, 10])
    expect(priceDomain(priced(0.9, 1800))).toEqual([0.5, 2000])
  })

  it('keeps a bound that is already a step, without float noise', () => {
    expect(priceDomain(priced(0.005, 20))).toEqual([0.005, 20])
    expect(priceDomain(priced(0.0002, 0.5))).toEqual([0.0002, 0.5])
    expect(priceDomain(priced(0.05, 0.3))).toEqual([0.05, 0.5])
  })

  it('moves with the costs, so the workload re-fits it', () => {
    const rates = [1, 5, 40]
    const cheaper = rates.map((rate) => rate * 0.1)

    expect(priceDomain(priced(...rates))).toEqual([1, 50])
    expect(priceDomain(priced(...cheaper))).toEqual([0.1, 5])
  })

  it('widens a single value so it still has a span', () => {
    expect(priceDomain(priced(1))).toEqual([0.5, 2])
  })

  it('falls back to a default span with no points', () => {
    expect(priceDomain([])).toEqual([0.01, 100])
  })
})

describe('domains at the ends of the double range', () => {
  const domains = [
    ['throughputDomain', (value: number) => throughputDomain([point('a', value)])],
    ['priceDomain', (value: number) => priceDomain([point('a', 50, value)])],
  ] as const

  const extremes = [1e308, Number.MAX_VALUE, 1.7e308, Number.MIN_VALUE, 3e-320, 1e-323] as const

  describe.each(domains)('%s', (_name, domain) => {
    it.each(extremes)('stays finite and positive for a single value of %s', (value) => {
      const [low, high] = domain(value)

      expect(low).toBeGreaterThan(0)
      expect(high).toBeLessThan(Infinity)
      expect(low).toBeLessThan(high)
      expect(low).toBeLessThanOrEqual(value)
      expect(high).toBeGreaterThanOrEqual(value)
    })

    it('falls back to the representable limit where widening or rounding is not', () => {
      expect(domain(1e308)).toEqual([5e307, Number.MAX_VALUE])
      expect(domain(Number.MAX_VALUE)).toEqual([1e308, Number.MAX_VALUE])
      expect(domain(Number.MIN_VALUE)).toEqual([Number.MIN_VALUE, 2 * Number.MIN_VALUE])
    })

    it('keeps ordinary single values as they were', () => {
      expect(domain(1)).toEqual([0.5, 2])
    })
  })

  it('fits a range from the smallest to the largest double', () => {
    const points = [point('a', Number.MIN_VALUE, Number.MIN_VALUE), point('b', 1.7e308, 1.7e308)]

    expect(throughputDomain(points)).toEqual([Number.MIN_VALUE, 1.7e308])
    expect(priceDomain(points)).toEqual([Number.MIN_VALUE, 1.7e308])
  })

  it('leaves decadeTicks finite and terminating on them', () => {
    for (const value of extremes) {
      const ticks = decadeTicks(priceDomain([point('a', 50, value)]))

      expect(ticks.every((tick) => Number.isFinite(tick) && tick > 0)).toBe(true)
    }

    expect(decadeTicks([Number.MAX_VALUE / 2, Number.MAX_VALUE])).toEqual([1e308])
  })
})

describe('decadeTicks', () => {
  it('lists the powers of ten strictly inside the domain', () => {
    expect(decadeTicks([1, 10_000])).toEqual([10, 100, 1000])
    expect(decadeTicks([5, 5000])).toEqual([10, 100, 1000])
    expect(decadeTicks([0.5, 200])).toEqual([1, 10, 100])
  })

  it('reaches below one, exactly', () => {
    expect(decadeTicks([0.002, 10])).toEqual([0.01, 0.1, 1])
    expect(decadeTicks([0.0002, 0.5])).toEqual([0.001, 0.01, 0.1])
  })

  it('leaves out a power of ten that ends the domain, since the frame marks the ends', () => {
    expect(decadeTicks([0.01, 100])).toEqual([0.1, 1, 10])
  })

  it('has no tick when the domain holds no power of ten', () => {
    expect(decadeTicks([20, 80])).toEqual([])
    expect(decadeTicks([0.2, 0.8])).toEqual([])
  })
})

describe('splitByNoCache', () => {
  it('separates the endpoints a cache would make cheaper from the rest, keeping order', () => {
    const points = [point('a', 1, 1), point('b', 2, 1, true), point('c', 3, 1)]

    expect(splitByNoCache(points)).toEqual({ filled: [points[0], points[2]], rings: [points[1]] })
  })

  it('handles no points', () => {
    expect(splitByNoCache([])).toEqual({ filled: [], rings: [] })
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
