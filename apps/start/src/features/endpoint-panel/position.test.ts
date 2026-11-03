import { describe, expect, it } from 'vitest'

import { NOT_IN_FILTERS, positionText } from './position'

const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

describe('positionText', () => {
  it('counts from one within the filtered rows', () => {
    expect(positionText(rows, 'a')).toBe('ENDPOINT 1 OF 3')
    expect(positionText(rows, 'c')).toBe('ENDPOINT 3 OF 3')
  })

  it('says so when the filters exclude the endpoint', () => {
    expect(positionText(rows, 'z')).toBe(NOT_IN_FILTERS)
    expect(positionText([], 'a')).toBe('NOT IN CURRENT FILTERS')
  })
})
