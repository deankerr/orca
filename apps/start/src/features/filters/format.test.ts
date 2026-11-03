import { describe, expect, it } from 'vitest'

import {
  formatBound,
  formatContext,
  formatMonths,
  formatPrice,
  formatReleaseWindow,
  formatThroughput,
} from './format'

describe('formatPrice', () => {
  it('shows at least two decimals', () => {
    expect(formatPrice(0.1)).toBe('$0.10')
    expect(formatPrice(1)).toBe('$1.00')
    expect(formatPrice(50)).toBe('$50.00')
  })

  it('keeps the decimals a value needs', () => {
    expect(formatPrice(0.125)).toBe('$0.125')
    expect(formatPrice(0.0123)).toBe('$0.0123')
  })
})

describe('formatContext', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatContext(8000)).toBe('8K')
    expect(formatContext(128_000)).toBe('128K')
    expect(formatContext(131_072)).toBe('131K')
    expect(formatContext(1_000_000)).toBe('1M')
    expect(formatContext(1_048_576)).toBe('1.05M')
  })

  it('leaves small counts whole', () => {
    expect(formatContext(512)).toBe('512')
  })
})

describe('formatThroughput and months', () => {
  it('rounds tokens per second', () => {
    expect(formatThroughput(99.6)).toBe('100')
  })

  it('writes months compactly', () => {
    expect(formatMonths(6)).toBe('6 mo')
    expect(formatReleaseWindow(3)).toBe('last 3 mo')
  })
})

describe('formatBound', () => {
  it('pairs each facet with its operator', () => {
    expect(formatBound('maxInput', 1)).toBe('≤ $1.00')
    expect(formatBound('minTps', 100)).toBe('≥ 100')
    expect(formatBound('minContext', 128_000)).toBe('≥ 128K')
  })
})
