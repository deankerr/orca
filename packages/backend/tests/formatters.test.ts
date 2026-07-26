import { describe, expect, test } from 'bun:test'

import { isMaterialPricingUpdate } from '../shared/formatters'

describe('isMaterialPricingUpdate', () => {
  test('suppresses token price changes below one cent per million tokens', () => {
    expect(isMaterialPricingUpdate('pricing.text_output', 0.0000025256, 0.0000025168)).toBe(false)
    expect(isMaterialPricingUpdate('pricing.text_cache_read', 0.00000015002, 0.0000001495)).toBe(
      false,
    )
  })

  test('retains token price changes of at least one cent per million tokens', () => {
    expect(isMaterialPricingUpdate('pricing.text_input', 0.00000003, 0.00000004)).toBe(true)
  })

  test('suppresses low-percentage algorithmic repricing from the Monitor feed', () => {
    expect(isMaterialPricingUpdate('pricing.text_output', 0.0000022792, 0.0000022616)).toBe(false)
    expect(isMaterialPricingUpdate('pricing.text_output', 0.0000022, 0.0000022836)).toBe(false)
  })

  test('retains substantial relative repricing', () => {
    expect(isMaterialPricingUpdate('pricing.text_output', 0.0000044, 0.00000242)).toBe(true)
  })

  test('suppresses discount changes below five percentage points', () => {
    expect(isMaterialPricingUpdate('pricing.discount', 0.426, 0.428)).toBe(false)
  })

  test('suppresses small discount oscillations from the Monitor feed', () => {
    expect(isMaterialPricingUpdate('pricing.discount', 0.5005, 0.4815)).toBe(false)
  })

  test('retains discount changes of at least five percentage points', () => {
    expect(isMaterialPricingUpdate('pricing.discount', 0.42, 0.35)).toBe(true)
  })

  test('does not suppress non-pricing or non-numeric changes', () => {
    expect(isMaterialPricingUpdate('context_length', 32_000, 32_001)).toBe(true)
    expect(isMaterialPricingUpdate('pricing.text_input', undefined, 0.000001)).toBe(true)
  })
})
