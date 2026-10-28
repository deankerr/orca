import { expect, test } from 'vitest'

import type { AlertChange, EntityAlert } from '../shared/alerts/curate'
import { muteNoise } from './mute'

const SCAN_AT = '2026-10-28T01:00:00.000Z'

const endpoint = {
  context: {
    endpoint: { endpoint_id: 'e', provider_display_name: 'Provider', provider_tag: 'provider' },
    model: { display_name: 'Model', model_id: 'author/model' },
    provider: { display_name: 'Provider', provider_id: 'provider' },
  },
  entity_id: 'e',
  entity_kind: 'endpoint',
  observed_at: SCAN_AT,
} as const

const priceChange: AlertChange = {
  after: '0.000002',
  before: '0.000001',
  field: 'pricing.prompt',
  kind: 'price',
}

const limitChange: AlertChange = { after: 60, before: 20, field: 'limit_rpm', kind: 'count' }

function model(type: 'model_added' | 'model_removed', model_id: string): EntityAlert {
  const identity = {
    context: { model: { display_name: model_id, model_id } },
    entity_id: model_id,
    entity_kind: 'model',
    observed_at: SCAN_AT,
  } as const

  return type === 'model_added'
    ? { ...identity, after: [], type }
    : { ...identity, before: [], type }
}

function run(events: EntityAlert[]) {
  const { muted, rows } = muteNoise(
    events.map((event, index) => ({ event, source_id: String(index) })),
  )

  return { kept: rows.map(({ event }) => event), muted }
}

test('pricing changes are muted while other fields of the same update remain', () => {
  const { kept, muted } = run([
    { ...endpoint, changes: [priceChange], type: 'endpoint_updated' },
    { ...endpoint, changes: [priceChange, limitChange], type: 'endpoint_updated' },
  ])

  expect(muted).toEqual(['0'])
  expect(kept).toEqual([{ ...endpoint, changes: [limitChange], type: 'endpoint_updated' }])
})

test('endpoint unlistings and relistings are muted; discoveries and unclassified arrivals remain', () => {
  const discovered: EntityAlert = {
    ...endpoint,
    after: [],
    previously_known: false,
    type: 'endpoint_added',
  }

  const unclassified: EntityAlert = { ...endpoint, after: [], type: 'endpoint_added' }

  const { kept, muted } = run([
    { ...endpoint, before: [], type: 'endpoint_removed' },
    { ...endpoint, after: [], previously_known: true, type: 'endpoint_added' },
    discovered,
    unclassified,
  ])

  expect(muted).toEqual(['0', '1'])
  expect(kept).toEqual([discovered, unclassified])
})

test('batch model cards are muted only when their standard model has the same lifecycle change', () => {
  const { muted } = run([
    model('model_added', 'a/one:batch'),
    model('model_added', 'a/one'),
    model('model_removed', 'a/two:batch'),
    model('model_removed', 'a/two'),
    model('model_added', 'a/three:batch'),
    model('model_removed', 'a/three'),
    model('model_added', 'a/four:free'),
    model('model_added', 'a/four'),
  ])

  expect(muted).toEqual(['0', '2'])
})

test('ineligible rows pass through without being counted as muted', () => {
  expect(muteNoise([{ event: null, source_id: 'x' }])).toEqual({
    muted: [],
    rows: [{ event: null, source_id: 'x' }],
  })
})
