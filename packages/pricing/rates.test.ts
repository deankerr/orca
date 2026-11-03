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

  it('treats rates without a finite positive $/M value as absent', () => {
    expect(perMillion('1e-330')).toBeNull()
    expect(perMillion('1e309')).toBeNull()
    expect(perMillion('1e999999999999999999999')).toBeNull()
    expect(perMillion('1e-999999999999999999999')).toBeNull()
    expect(perMillion('9'.repeat(400))).toBeNull()
  })

  it('keeps the original string of an unrepresentable rate for display', () => {
    expect(quotedRate('1e309')).toBe('1e309')
    expect(quotedRate('1e-330')).toBe('1e-330')
  })

  it('keeps the extremes that are representable', () => {
    expect(perMillion('1e302')).toBe(1e308)
    expect(perMillion('1e-312')).toBe(1e-306)
    expect(perMillion('5e-318')).toBe(5e-312)
  })
})

describe('blended price', () => {
  it('weights input three to one against output', () => {
    expect(blendedPrice(1, 5)).toBe(2)
    expect(blendedPrice(0.15, 0.6)).toBeCloseTo(0.2625)
  })

  it('stays finite for huge finite rates', () => {
    expect(blendedPrice(1e308, 1e308)).toBe(1e308)
    expect(blendedPrice(Number.MAX_VALUE, Number.MAX_VALUE)).toBe(Number.MAX_VALUE)
  })

  it('is absent when either rate is absent', () => {
    expect(blendedPrice(null, 5)).toBeNull()
    expect(blendedPrice(1, null)).toBeNull()
  })
})
