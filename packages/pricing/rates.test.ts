import { describe, expect, it } from 'vitest'

import { blendedPrice, perMillion, quotedRate } from './index'

describe('quoted rates', () => {
  it('keeps zero as a real price and treats absent rates as unquoted', () => {
    expect(quotedRate(null)).toBeNull()
    expect(quotedRate('0')).toBe('0')
    expect(quotedRate('0.000')).toBe('0.000')
    expect(quotedRate('0E-7')).toBe('0E-7')
    expect(quotedRate('0.0000025')).toBe('0.0000025')
  })

  it('treats negative and malformed rates as unquoted', () => {
    expect(quotedRate('-1')).toBeNull()
    expect(quotedRate('-0.0000025')).toBeNull()
    expect(quotedRate('')).toBeNull()
    expect(quotedRate('free')).toBeNull()
  })

  it('converts per-token rates to exact $/M values', () => {
    expect(perMillion('0.0000025')).toBe(2.5)
    expect(perMillion('0.00000015')).toBe(0.15)
    expect(perMillion('2.5E-6')).toBe(2.5)
    expect(perMillion('3e-7')).toBe(0.3)
    expect(perMillion(null)).toBeNull()
  })

  it('converts zero to 0 in any spelling', () => {
    expect(perMillion('0')).toBe(0)
    expect(perMillion('0.000')).toBe(0)
    expect(perMillion('0E-7')).toBe(0)
    expect(perMillion('0e999999999999999999999')).toBe(0)
  })

  it('treats negative and malformed rates as absent', () => {
    expect(perMillion('-1')).toBeNull()
    expect(perMillion('-0')).toBeNull()
    expect(perMillion('')).toBeNull()
    expect(perMillion('free')).toBeNull()
  })

  it('treats rates without a finite non-negative $/M value as absent', () => {
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

  it('is zero when both rates are zero', () => {
    expect(blendedPrice(0, 0)).toBe(0)
  })

  it('weights a zero rate like any other', () => {
    expect(blendedPrice(0, 4)).toBe(1)
    expect(blendedPrice(4, 0)).toBe(3)
  })

  it('is absent when either rate is absent', () => {
    expect(blendedPrice(null, 5)).toBeNull()
    expect(blendedPrice(1, null)).toBeNull()
  })
})
