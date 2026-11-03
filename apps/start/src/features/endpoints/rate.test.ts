import { describe, expect, it } from 'vitest'

import { formatRate } from './rate'

describe('formatRate', () => {
  it('shows a zero rate as $0 in any spelling', () => {
    expect(formatRate('0')).toBe('$0')
    expect(formatRate('0.000')).toBe('$0')
    expect(formatRate('0E-7')).toBe('$0')
  })

  it('shows per-token rates as dollars per million tokens', () => {
    expect(formatRate('0.00000125')).toBe('$1.25')
    expect(formatRate('0.000000125')).toBe('$0.125')
    expect(formatRate('0.00001')).toBe('$10.00')
  })

  it('keeps one significant digit of a tiny nonzero rate', () => {
    expect(formatRate('0.000000000198')).toBe('$0.0002')
  })

  it('is absent for an absent rate', () => {
    expect(formatRate(null)).toBeNull()
  })
})
