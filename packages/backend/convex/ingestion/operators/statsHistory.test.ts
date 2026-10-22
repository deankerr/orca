import { expect, test } from 'vitest'

import { derive } from './statsHistory'
import { hour, scan } from './testing'

const reading = (endpoint_id: string, p50_latency: number | null) => ({
  endpoint_id,
  sample: { p50_latency },
  tier: 'default',
})
const listed = (p50_latency: number | null) => ({
  model: 'm1',
  provider: 'p1',
  stats: { default: { p50_latency } },
})

test("a record owns only its introduced scan's readings, including repeated values", () => {
  const previous = scan(hour(0), { endpoints: { e1: listed(10) } })
  const next = scan(hour(1), { endpoints: { e1: listed(10), e2: listed(null) } })
  const rows = [
    { ...reading('e1', 10), scan_at: hour(1) },
    { ...reading('e2', null), scan_at: hour(1) },
  ]

  expect(derive({ next, previous })).toEqual(rows)
  expect(derive({ next, previous: null })).toEqual(rows)
})
