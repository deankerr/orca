import { expect, test } from 'vitest'

import type { EndpointPriceRow } from '../../catalog/tables/pricing'
import { derive } from './pricingHistory'
import { hour, scan, sequence } from './testing'

const at = (index: number, prompt?: string) =>
  scan(
    hour(index),
    prompt === undefined ? {} : { endpoints: { e1: { model: 'm1', prompt, provider: 'p1' } } },
  )

const quote = (index: number, prompt: string) => ({
  discount: 0,
  endpoint_id: 'e1',
  meters: { prompt },
  scan_at: hour(index),
})

test('quotes open listing periods and record changes; equal quotes and departures store nothing', () => {
  expect(derive({ next: at(0, '1'), previous: null })).toEqual([quote(0, '1')])
  expect(derive({ next: at(1, '1'), previous: at(0, '1') })).toEqual([])
  expect(derive({ next: at(2, '2'), previous: at(1, '1') })).toEqual([quote(2, '2')])
  expect(derive({ next: at(3), previous: at(2, '2') })).toEqual([])
  expect(derive({ next: at(4, '2'), previous: at(3) })).toEqual([quote(4, '2')])
})

/** Rows are sorted by scan time; the latest quote at or before the read time applies. */
function quoteAt(rows: readonly EndpointPriceRow[], endpoint_id: string, time: string) {
  const latest = rows.findLast((row) => row.endpoint_id === endpoint_id && row.scan_at <= time)

  if (latest === undefined) {
    return undefined
  }

  const { scan_at: _scanAt, ...latestQuote } = latest

  return latestQuote
}

test('every listed endpoint reads the quote from its own scan', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const scans = sequence(seed, 8)

    const rows = scans
      .flatMap((next, index) => derive({ next, previous: scans[index - 1] ?? null }))
      .toSorted((a, b) => a.scan_at.localeCompare(b.scan_at))

    for (const next of scans) {
      for (const own of derive({ next, previous: null })) {
        const { scan_at: _scanAt, ...expected } = own
        expect(quoteAt(rows, own.endpoint_id, next.scan_at)).toEqual(expected)
      }
    }
  }
})
