import { describe, expect, it } from 'vitest'

import { boundStops, histogramBars, nearestStopIndex, stepStop } from './bars'

const thresholds = [10, 20, 30]
const histogram = { counts: [1, 4, 2, 0], thresholds }

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

describe('stepping', () => {
  const stops = boundStops(thresholds, 'min')

  it('finds the stop nearest a bound', () => {
    expect(nearestStopIndex(stops, undefined)).toBe(0)
    expect(nearestStopIndex(stops, 21)).toBe(2)
  })

  it('steps toward higher values and clamps at the ends', () => {
    expect(stepStop(stops, undefined, 1)).toBe(10)
    expect(stepStop(stops, 20, 1)).toBe(30)
    expect(stepStop(stops, 30, 1)).toBe(30)
    expect(stepStop(stops, 10, -1)).toBeUndefined()
    expect(stepStop(stops, undefined, -1)).toBeUndefined()
  })

  it('steps a maximum from no bound back to the highest threshold', () => {
    expect(stepStop(boundStops(thresholds, 'max'), undefined, -1)).toBe(30)
  })
})
