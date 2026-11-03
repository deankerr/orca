import { describe, expect, it } from 'vitest'

import { boundStops, histogramBars, keptCount, nearestStopIndex, pressedBound } from './bars'

const thresholds = [10, 20, 30]
const histogram = { counts: [1, 4, 2, 0], missing: 3, thresholds }

describe('boundStops', () => {
  it('ends a maximum at no bound', () => {
    expect(boundStops(thresholds, 'max')).toEqual([10, 20, 30, undefined])
  })

  it('starts a minimum at no bound', () => {
    expect(boundStops(thresholds, 'min')).toEqual([undefined, 10, 20, 30])
  })
})

describe('histogramBars', () => {
  it('keeps every bar within when there is no bound', () => {
    expect(histogramBars(histogram, 'max', undefined).map(({ within }) => within)).toEqual([
      true,
      true,
      true,
      true,
    ])
  })

  it('scales bars to the tallest bin', () => {
    expect(histogramBars(histogram, 'max', undefined).map(({ share }) => share)).toEqual([
      0.25, 1, 0.5, 0,
    ])
  })

  it('keeps the bins up to a maximum', () => {
    const bars = histogramBars(histogram, 'max', 20)

    expect(bars.map(({ within }) => within)).toEqual([true, true, false, false])
    expect(bars.map(({ stop }) => stop)).toEqual([10, 20, 30, undefined])
  })

  it('keeps the bins from a minimum up', () => {
    const bars = histogramBars(histogram, 'min', 20)

    expect(bars.map(({ within }) => within)).toEqual([false, false, true, true])
    expect(bars.map(({ stop }) => stop)).toEqual([undefined, 10, 20, 30])
  })

  it('keeps a bin a bound between thresholds cuts through', () => {
    expect(histogramBars(histogram, 'max', 15).map(({ within }) => within)).toEqual([
      true,
      true,
      false,
      false,
    ])
  })

  it('has no share when every bin is empty', () => {
    const bars = histogramBars({ counts: [0, 0], thresholds: [5] }, 'min', undefined)

    expect(bars.map(({ share }) => share)).toEqual([0, 0])
  })
})

describe('nearestStopIndex', () => {
  const stops = boundStops(thresholds, 'min')

  it('finds the stop a bound sits on', () => {
    expect(nearestStopIndex(stops, undefined)).toBe(0)
    expect(nearestStopIndex(stops, 20)).toBe(2)
  })

  it('finds the stop nearest a bound between thresholds', () => {
    expect(nearestStopIndex(stops, 21)).toBe(2)
    expect(nearestStopIndex(stops, 27)).toBe(3)
  })
})

describe('pressedBound', () => {
  it("sets the bar's threshold", () => {
    expect(pressedBound(20, undefined)).toBe(20)
    expect(pressedBound(20, 10)).toBe(20)
  })

  it('clears a bound already on the bar', () => {
    expect(pressedBound(20, 20)).toBeUndefined()
  })

  it('sets the exact threshold over a bound between thresholds', () => {
    expect(pressedBound(20, 21)).toBe(20)
  })

  it('clears the bound from the open-ended bar', () => {
    expect(pressedBound(undefined, 20)).toBeUndefined()
    expect(pressedBound(undefined, undefined)).toBeUndefined()
  })
})

describe('keptCount', () => {
  it('counts the bins a maximum keeps', () => {
    expect(keptCount(histogram, 'max', 10)).toBe(1)
    expect(keptCount(histogram, 'max', 20)).toBe(5)
  })

  it('counts the bins a minimum keeps', () => {
    expect(keptCount(histogram, 'min', 20)).toBe(2)
  })

  it('keeps endpoints with no value only without a bound', () => {
    expect(keptCount(histogram, 'max', undefined)).toBe(10)
  })
})
