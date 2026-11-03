import { describe, expect, it } from 'vitest'

import { blendedPrice, perMillion, quotedRate } from './index'

describe('quoted rates', () => {
  it('treats absent and zero rates as unquoted', () => {
    expect(quotedRate(null)).toBeNull()
    expect(quotedRate('0')).toBeNull()
    expect(quotedRate('0.000')).toBeNull()
    expect(quotedRate('0E-7')).toBeNull()
    expect(quotedRate('0.0000025')).toBe('0.0000025')
  })

  it('converts per-token rates to exact $/M values', () => {
    expect(perMillion('0.0000025')).toBe(2.5)
    expect(perMillion('0.00000015')).toBe(0.15)
    expect(perMillion('2.5E-6')).toBe(2.5)
    expect(perMillion('3e-7')).toBe(0.3)
    expect(perMillion('0')).toBeNull()
    expect(perMillion(null)).toBeNull()
  })
})

describe('blended price', () => {
  it('weights input three to one against output', () => {
    expect(blendedPrice(1, 5)).toBe(2)
    expect(blendedPrice(0.15, 0.6)).toBeCloseTo(0.2625)
  })

  it('is absent when either rate is absent', () => {
    expect(blendedPrice(null, 5)).toBeNull()
    expect(blendedPrice(1, null)).toBeNull()
  })
})
