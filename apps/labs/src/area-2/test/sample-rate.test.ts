import { describe, expect, test } from 'bun:test'

import { isCrawlRequired } from '../sample-rate.ts'

describe('Area 2 sample rate', () => {
  test('requires the first usable crawl of a UTC day', () => {
    const first = String(Date.UTC(2025, 0, 1, 1))
    const laterSameDay = String(Date.UTC(2025, 0, 1, 23))
    const nextDay = String(Date.UTC(2025, 0, 2, 1))

    expect(isCrawlRequired(first, undefined, 'daily')).toBe(true)
    expect(isCrawlRequired(laterSameDay, first, 'daily')).toBe(false)
    expect(isCrawlRequired(nextDay, first, 'daily')).toBe(true)
  })

  test('requires every crawl at the all sample rate', () => {
    const first = String(Date.UTC(2025, 0, 1, 1))
    const laterSameDay = String(Date.UTC(2025, 0, 1, 23))

    expect(isCrawlRequired(laterSameDay, first, 'all')).toBe(true)
  })
})
