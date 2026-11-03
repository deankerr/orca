import { describe, expect, it } from 'vitest'

import { fromSortingState, isSortColumn, sortDirection, toSortingState } from './sorting'

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

describe('isSortColumn', () => {
  it('accepts only sortable columns', () => {
    expect(isSortColumn('latency')).toBe(true)
    expect(isSortColumn('properties')).toBe(false)
  })
})

describe('sortDirection', () => {
  it('orders only the keyed column', () => {
    expect(sortDirection('-throughput', 'throughput')).toBe('desc')
    expect(sortDirection('input', 'input')).toBe('asc')
    expect(sortDirection('input', 'output')).toBe(false)
  })
})
