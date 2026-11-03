import { describe, expect, it } from 'vitest'

import { steppedRowId } from './navigation'

const ids = ['a', 'b', 'c']

describe('steppedRowId', () => {
  it('moves through the list', () => {
    expect(steppedRowId(ids, 'a', 'next')).toBe('b')
    expect(steppedRowId(ids, 'c', 'previous')).toBe('b')
  })

  it('stops at either end', () => {
    expect(steppedRowId(ids, 'c', 'next')).toBe('c')
    expect(steppedRowId(ids, 'a', 'previous')).toBe('a')
  })

  it('starts at the first row without a selection in the list', () => {
    expect(steppedRowId(ids, undefined, 'next')).toBe('a')
    expect(steppedRowId(ids, undefined, 'previous')).toBe('a')
    expect(steppedRowId(ids, 'filtered-out', 'next')).toBe('a')
  })

  it('finds nothing in an empty list', () => {
    expect(steppedRowId([], undefined, 'next')).toBeNull()
    expect(steppedRowId([], 'a', 'previous')).toBeNull()
  })
})
