import { describe, expect, it } from 'vitest'

import {
  formatBound,
  formatMonths,
  formatPriceBound,
  formatReleaseWindow,
  formatThroughputBound,
} from './bound-labels'

describe('formatPriceBound', () => {
  it('shows at least two decimals', () => {
    expect(formatPriceBound(0.1)).toBe('$0.10')
    expect(formatPriceBound(1)).toBe('$1.00')
    expect(formatPriceBound(50)).toBe('$50.00')
  })

  it('keeps the decimals a value needs', () => {
    expect(formatPriceBound(0.125)).toBe('$0.125')
    expect(formatPriceBound(0.0123)).toBe('$0.0123')
  })
})

describe('formatThroughputBound and months', () => {
  it('rounds tokens per second', () => {
    expect(formatThroughputBound(99.6)).toBe('100')
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
    expect(formatBound('minContext', 1_048_576)).toBe('≥ 1.05M')
  })
})
