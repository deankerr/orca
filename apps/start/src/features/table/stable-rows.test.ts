import { describe, expect, it } from 'vitest'

import { sameItems } from './stable-rows'

describe('sameItems', () => {
  const a = { id: 'a' }
  const b = { id: 'b' }

  it('compares items by identity, in order', () => {
    expect(sameItems([a, b], [a, b])).toBe(true)
    expect(sameItems([a, b], [b, a])).toBe(false)
    expect(sameItems([a], [a, b])).toBe(false)
    expect(sameItems([a], [{ id: 'a' }])).toBe(false)
  })

  it('treats two empty lists as the same', () => {
    expect(sameItems([], [])).toBe(true)
  })
})
