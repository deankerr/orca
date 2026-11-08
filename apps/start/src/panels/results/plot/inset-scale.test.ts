import { describe, expect, it } from 'vitest'

import { insetLogScale } from './inset-scale'

describe('insetLogScale', () => {
  it('keeps the ends of the domain the inset inside an ascending range', () => {
    const scale = insetLogScale([0.01, 100], 4).range([0, 1000])

    expect(scale(0.01)).toBeCloseTo(4)
    expect(scale(100)).toBeCloseTo(996)
    expect(scale(1)).toBeCloseTo(500)
  })

  it('keeps the ends the inset inside a descending range, as the y axis runs', () => {
    const scale = insetLogScale([1, 1000], 4).range([112, 0])

    expect(scale(1)).toBeCloseTo(108)
    expect(scale(1000)).toBeCloseTo(4)
  })

  it('keeps its inset and domain through a copy, and the copy does not share the range', () => {
    const scale = insetLogScale([1, 100], 3).range([0, 100])
    const copy = scale.copy().range([0, 200])

    expect(copy(1)).toBeCloseTo(3)
    expect(copy(100)).toBeCloseTo(197)
    expect(scale(100)).toBeCloseTo(97)
    expect(copy.domain()).toEqual([1, 100])
  })

  it('inverts what it maps', () => {
    const scale = insetLogScale([1, 100], 3).range([0, 100])

    const position = scale(10) ?? Number.NaN

    expect(scale.invert?.(position)).toBeCloseTo(10)
  })
})
