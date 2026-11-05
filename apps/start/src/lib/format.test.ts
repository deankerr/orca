import { describe, expect, it } from 'vitest'

import {
  ABSENT,
  formatContext,
  formatCount,
  formatLatency,
  formatRate,
  formatRateCell,
  formatScanTime,
} from './format'

describe('formatContext', () => {
  it.each([
    [1_048_576, '1.05M'],
    [1_000_000, '1M'],
    [262_144, '262K'],
    [200_000, '200K'],
    [128_000, '128K'],
    [32_768, '32.8K'],
    [8192, '8.19K'],
    [1000, '1K'],
    [512, '512'],
    [999_999, '1M'],
  ])('shows %d tokens as %s', (tokens, text) => {
    expect(formatContext(tokens)).toBe(text)
  })

  it('shows absent context as a dash', () => {
    expect(formatContext(null)).toBe(ABSENT)
  })
})

describe('formatCount', () => {
  it('rounds to whole numbers with grouping', () => {
    expect(formatCount(87.4)).toBe('87')
    expect(formatCount(1234.6)).toBe('1,235')
  })

  it('keeps zero and shows absent values as a dash', () => {
    expect(formatCount(0)).toBe('0')
    expect(formatCount(null)).toBe(ABSENT)
  })
})

describe('formatRateCell', () => {
  it('prices a per-token rate per million tokens at three fixed decimals', () => {
    expect(formatRateCell('0.0000025')).toBe('$2.500')
    expect(formatRateCell('0.0000005')).toBe('$0.500')
    expect(formatRateCell('0.000015')).toBe('$15.000')
    expect(formatRateCell('0.000000119')).toBe('$0.119')
  })

  it('rounds half away from zero on the decimal string', () => {
    expect(formatRateCell('0.0000000011')).toBe('$0.001')
    expect(formatRateCell('0.0000000015')).toBe('$0.002')
    expect(formatRateCell('0.0000009996')).toBe('$1.000')
  })

  it('falls back to the full display when three decimals would show $0.000', () => {
    expect(formatRateCell('0.0000000004')).toBe('$0.0004')
    expect(formatRateCell('0.000000000198')).toBe('$0.0002')
  })

  it('shows a free rate as $0 in any spelling', () => {
    expect(formatRateCell('0')).toBe('$0')
    expect(formatRateCell('0E-7')).toBe('$0')
  })

  it('shows absent rates as a dash', () => {
    expect(formatRateCell(null)).toBe(ABSENT)
  })
})

describe('formatLatency', () => {
  it.each([
    [122, '0.12s'],
    [1850, '1.85s'],
    [0, '0.00s'],
    [9994, '9.99s'],
    [9996, '10.0s'],
    [10_000, '10.0s'],
    [54_662, '54.7s'],
    [99_949, '99.9s'],
    [99_950, '100s'],
    [100_400, '100s'],
    [123_456, '123s'],
    [1_234_567, '1,235s'],
  ])('shows %d ms as %s', (milliseconds, text) => {
    expect(formatLatency(milliseconds)).toBe(text)
  })

  it('shows absent latency as a dash', () => {
    expect(formatLatency(null)).toBe(ABSENT)
  })
})

describe('formatScanTime', () => {
  it('formats in UTC whatever the local zone', () => {
    expect(formatScanTime('2026-10-27T23:40:12.000Z')).toBe('scan 2026-10-27 23:40 UTC')
    expect(formatScanTime('2026-03-08T02:30:00.000Z')).toBe('scan 2026-03-08 02:30 UTC')
  })

  it('shows an unreadable time as a dash', () => {
    expect(formatScanTime('not a time')).toBe(ABSENT)
  })

  it('says so before the first scan', () => {
    expect(formatScanTime(null)).toBe('no scan yet')
  })
})

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
