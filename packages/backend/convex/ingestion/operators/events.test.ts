import { expect, test } from 'bun:test'

import { derive } from './events'
import { hour, scan } from './testing'

const listed = (index: number, prompt: string) =>
  scan(hour(index), {
    endpoints: { e1: { model: 'm1', prompt, provider: 'p1' } },
    names: { m1: 'Alpha', p1: 'One' },
  })

test('a baseline has no transitions to describe', () => {
  expect(derive({ next: listed(0, '1'), previous: null })).toEqual([])
})

test('a pair dates its changes at the introduced scan, with context from the relevant side', () => {
  const removed = derive({ next: scan(hour(1)), previous: listed(0, '1') })

  expect(removed.map(({ entity_kind, type, scan_at }) => ({ entity_kind, scan_at, type }))).toEqual(
    [
      { entity_kind: 'model', scan_at: hour(1), type: 'REMOVE' },
      { entity_kind: 'provider', scan_at: hour(1), type: 'REMOVE' },
      { entity_kind: 'endpoint', scan_at: hour(1), type: 'REMOVE' },
    ],
  )
  expect(removed[2]?.context).toMatchObject({ model: { display_name: 'Alpha', model_id: 'm1' } })
})

test('a price update carries both complete quotes', () => {
  const [update] = derive({ next: listed(1, '2'), previous: listed(0, '1') })

  expect(update).toMatchObject({
    context: {
      pricing: { after: { meters: { prompt: '2' } }, before: { meters: { prompt: '1' } } },
    },
    entity_kind: 'endpoint',
    type: 'UPDATE',
  })
})
