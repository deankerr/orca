import { expect, test } from 'vitest'

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

  expect(derive({ next, previous: scan(hour(0)) })).toEqual({
    rows: [{ endpoint_id: 'e1', p50_latency: 12 }],
    scan_at: hour(1),
  })
})

test('an empty snapshot is complete and replaces an older one', () => {
  const empty = derive({ next: scan(hour(2)), previous: null })

  expect(empty).toEqual({ rows: [], scan_at: hour(2) })
  expect(supersedes({ rows: [{ endpoint_id: 'e1' }], scan_at: hour(1) }, empty)).toBe(true)
  expect(supersedes(empty, { rows: [], scan_at: hour(1) })).toBe(false)
  expect(supersedes(null, empty)).toBe(true)
})
