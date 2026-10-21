import { expect, test } from 'bun:test'

import { derive, supersedes } from './currentStats'
import { hour, scan } from './testing'

test('a snapshot keeps usable default-tier readings from its scan alone', () => {
  const listed = (stats: Record<string, Record<string, number | null>>) => ({
    model: 'm1',
    provider: 'p1',
    stats,
  })
  const next = scan(hour(1), {
    endpoints: {
      e1: listed({ default: { p50_latency: 12, p50_throughput: -1 } }),
      e2: listed({ default: { p50_latency: null } }),
      e3: listed({ free: { p50_latency: 5 } }),
    },
  })

  expect(derive({ previous: scan(hour(0)), next })).toEqual({
    scan_at: hour(1),
    rows: [{ endpoint_id: 'e1', p50_latency: 12 }],
  })
})

test('an empty snapshot is complete and replaces an older one', () => {
  const empty = derive({ previous: null, next: scan(hour(2)) })

  expect(empty).toEqual({ scan_at: hour(2), rows: [] })
  expect(supersedes({ scan_at: hour(1), rows: [{ endpoint_id: 'e1' }] }, empty)).toBe(true)
  expect(supersedes(empty, { scan_at: hour(1), rows: [] })).toBe(false)
  expect(supersedes(null, empty)).toBe(true)
})
