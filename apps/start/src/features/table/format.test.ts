import { describe, expect, it } from 'vitest'

import { ABSENT, formatContext, formatCount, formatRate, formatScanTime } from './format'

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

describe('formatRate', () => {
  it('prices a per-token rate per million tokens', () => {
    expect(formatRate('0.0000025')).toBe('$2.50')
    expect(formatRate('0.000000119')).toBe('$0.119')
  })

  it('shows absent rates as a dash', () => {
    expect(formatRate(null)).toBe(ABSENT)
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
})
