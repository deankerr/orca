import { expect, test } from 'bun:test'

import type { ObservationRow } from '../../catalog/tables/observations'
import { derive } from './observations'
import { hour, scan, sequence } from './testing'

const listed = scan(hour(0), {
  endpoints: { e1: { model: 'm1', provider: 'p1' }, e2: { model: 'm1', provider: 'p2' } },
})

const counts = (endpoint_count: number, previous_endpoint_count: number | null) => ({
  endpoint_count,
  previous_endpoint_count,
})

const endpoint = (scan_at: string, detected: boolean, model_id: string, provider_id: string) => ({
  entity_kind: 'endpoint' as const,
  scan_at,
  detected,
  model_id,
  provider_id,
  provider_tag: provider_id,
})

test('a baseline states every listed endpoint and the endpoint count of each parent', () => {
  expect(derive({ previous: null, next: listed })).toEqual([
    { entity_kind: 'model', entity_id: 'm1', scan_at: hour(0), ...counts(2, null) },
    { entity_kind: 'provider', entity_id: 'p1', scan_at: hour(0), ...counts(1, null) },
    { entity_kind: 'provider', entity_id: 'p2', scan_at: hour(0), ...counts(1, null) },
    { entity_id: 'e1', ...endpoint(hour(0), true, 'm1', 'p1') },
    { entity_id: 'e2', ...endpoint(hour(0), true, 'm1', 'p2') },
  ])
})

test('a pair emits only changed state, dated at its introduced scan', () => {
  expect(derive({ previous: listed, next: { ...listed, scan_at: hour(1) } })).toEqual([])

  const moved = scan(hour(1), {
    endpoints: { e1: { model: 'm2', provider: 'p1' }, e2: { model: 'm1', provider: 'p2' } },
  })

  expect(derive({ previous: listed, next: moved })).toEqual([
    { entity_kind: 'model', entity_id: 'm1', scan_at: hour(1), ...counts(1, 2) },
    { entity_kind: 'model', entity_id: 'm2', scan_at: hour(1), ...counts(1, 0) },
    { entity_id: 'e1', ...endpoint(hour(1), true, 'm2', 'p1') },
  ])
})

test('a parent departs with its last endpoint, which retains its last relationships', () => {
  const departed = scan(hour(1), { endpoints: { e2: { model: 'm1', provider: 'p2' } } })

  expect(derive({ previous: listed, next: departed })).toEqual([
    { entity_kind: 'model', entity_id: 'm1', scan_at: hour(1), ...counts(1, 2) },
    { entity_kind: 'provider', entity_id: 'p1', scan_at: hour(1), ...counts(0, 1) },
    { entity_id: 'e1', ...endpoint(hour(1), false, 'm1', 'p1') },
  ])
})

/** The read rule: each entity's latest value at or before the read time, ignoring absent states. */
function stateAt(rows: readonly ObservationRow[], at: string) {
  const latest = new Map<string, ObservationRow>()

  for (const row of rows.filter(({ scan_at }) => scan_at <= at).toSorted(byScanAt)) {
    latest.set(`${row.entity_kind}:${row.entity_id}`, row)
  }

  return new Map(
    [...latest]
      .filter(([, row]) => (row.entity_kind === 'endpoint' ? row.detected : row.endpoint_count > 0))
      .map(([key, row]) => {
        const { scan_at: _scanAt, ...state } = row
        // A pair's previous count describes the comparison, not the state at the scan.
        return [
          key,
          'previous_endpoint_count' in state ? { ...state, previous_endpoint_count: null } : state,
        ]
      }),
  )
}

function byScanAt(a: ObservationRow, b: ObservationRow) {
  return a.scan_at.localeCompare(b.scan_at)
}

test('a baseline and its following pairs reproduce every scan as its own baseline would', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const scans = sequence(seed, 8)
    const rows = scans.flatMap((next, index) =>
      derive({ previous: scans[index - 1] ?? null, next }),
    )

    for (const next of scans) {
      expect(stateAt(rows, next.scan_at)).toEqual(
        stateAt(derive({ previous: null, next }), next.scan_at),
      )
    }
  }
})
