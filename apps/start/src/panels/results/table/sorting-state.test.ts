import { describe, expect, it } from 'vitest'

import { fromSortingState, sortDirection, toSortingState } from './sorting-state'

describe('toSortingState', () => {
  it('reads ascending and descending keys', () => {
    expect(toSortingState('input')).toEqual([{ desc: false, id: 'input' }])
    expect(toSortingState('-throughput')).toEqual([{ desc: true, id: 'throughput' }])
  })
})

describe('fromSortingState', () => {
  it('round-trips with toSortingState', () => {
    expect(fromSortingState(toSortingState('-cacheRead'))).toBe('-cacheRead')
    expect(fromSortingState(toSortingState('model'))).toBe('model')
  })

  it('ignores empty state and columns the URL cannot sort by', () => {
    expect(fromSortingState([])).toBeNull()
    expect(fromSortingState([{ desc: false, id: 'unknown' }])).toBeNull()
  })
})

describe('sortDirection', () => {
  it('orders only the keyed column', () => {
    expect(sortDirection('-throughput', 'throughput')).toBe('desc')
    expect(sortDirection('input', 'input')).toBe('asc')
    expect(sortDirection('input', 'output')).toBe(false)
  })
})
