/// <reference types="bun" />

import { expect, test } from 'bun:test'

import { crawlHour, legacyBackfillEndCrawlId, nextCrawlHour } from './legacyBackfill'

test('uses UTC hour boundaries for legacy sampling', () => {
  expect(crawlHour(Date.parse('2026-09-01T23:42:15.123Z').toString())).toEqual({
    fromCrawlId: Date.parse('2026-09-01T23:00:00.000Z').toString(),
    beforeCrawlId: Date.parse('2026-09-02T00:00:00.000Z').toString(),
  })
  expect(nextCrawlHour('2026-09-01T23:42:15.123Z')).toBe(
    Date.parse('2026-09-02T00:00:00.000Z').toString(),
  )
})

test('requires a valid legacy backfill cutoff', () => {
  expect(legacyBackfillEndCrawlId('2026-09-02T08:00:00.000Z')).toBe(
    Date.parse('2026-09-02T08:00:00.000Z').toString(),
  )
  expect(legacyBackfillEndCrawlId(undefined)).toBeNull()
  expect(legacyBackfillEndCrawlId('stop')).toBeNull()
})
