import { expect, test } from 'bun:test'

import { derive } from './events'
import { hour, scan } from './testing'

const listed = (index: number, prompt: string) =>
  scan(hour(index), {
    names: { m1: 'Alpha', p1: 'One' },
    endpoints: { e1: { model: 'm1', provider: 'p1', prompt } },
  })

test('a baseline has no transitions to describe', () => {
  expect(derive({ previous: null, next: listed(0, '1') })).toEqual([])
})

test('a pair dates its changes at the introduced scan, with context from the relevant side', () => {
  const removed = derive({ previous: listed(0, '1'), next: scan(hour(1)) })

  expect(removed.map(({ entity_kind, type, scan_at }) => ({ entity_kind, type, scan_at }))).toEqual(
    [
      { entity_kind: 'model', type: 'REMOVE', scan_at: hour(1) },
      { entity_kind: 'provider', type: 'REMOVE', scan_at: hour(1) },
      { entity_kind: 'endpoint', type: 'REMOVE', scan_at: hour(1) },
    ],
  )
  expect(removed[2]?.context).toMatchObject({ model: { model_id: 'm1', display_name: 'Alpha' } })
})

test('a price update carries both complete quotes', () => {
  const [update] = derive({ previous: listed(0, '1'), next: listed(1, '2') })

  expect(update).toMatchObject({
    entity_kind: 'endpoint',
    type: 'UPDATE',
    context: {
      pricing: { before: { meters: { prompt: '1' } }, after: { meters: { prompt: '2' } } },
    },
  })
})
