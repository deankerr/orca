import { expect, test } from 'bun:test'

import { fromCollected } from '../scanNew/extract'
import { prepare } from './observations'

const a = '2026-10-10T10:00:00.000Z'
const b = '2026-10-10T11:17:00.000Z'

function scan(
  scan_at: string,
  entries: {
    model_id: string
    endpoints: { id: string; provider_id: string; provider_tag?: string }[]
  }[],
) {
  return fromCollected({
    scan_at,
    entries: entries.map(({ model_id, endpoints }) => ({
      model_id,
      variant: 'standard',
      model: {
        slug: model_id,
        permaslug: model_id,
        short_name: model_id,
        created_at: a,
        input_modalities: ['text'],
        output_modalities: ['text'],
      },
      endpoints: endpoints.map(({ id, provider_id, provider_tag }) => ({
        id,
        model_variant_slug: model_id,
        provider_slug: provider_tag ?? provider_id,
        provider_display_name: provider_id,
        variant: 'standard',
        provider_info: { slug: provider_id, displayName: provider_id },
      })),
    })),
  })
}

const endpoint = { id: 'endpoint', provider_id: 'provider' }
const populated = [{ model_id: 'model', endpoints: [endpoint] }]
const endpointless = [{ model_id: 'model', endpoints: [] }]

test('baseline retains endpointless models and counts endpoints across models and providers', () => {
  const previous = { ...scan(a, []), scan_at: null }
  const next = scan(b, [
    { model_id: 'model', endpoints: [endpoint, { id: 'second', provider_id: 'other' }] },
    { model_id: 'shared', endpoints: [{ id: 'third', provider_id: 'provider' }] },
    { model_id: 'empty', endpoints: [] },
  ])
  const rows = prepare({ previous, next })
  expect(rows).toHaveLength(8)
  expect(rows.filter((row) => row.entity_kind !== 'endpoint')).toEqual([
    { entity_kind: 'model', entity_id: 'model', scan_at: b, detected: true, endpoint_count: 2 },
    { entity_kind: 'model', entity_id: 'shared', scan_at: b, detected: true, endpoint_count: 1 },
    { entity_kind: 'model', entity_id: 'empty', scan_at: b, detected: true, endpoint_count: 0 },
    { entity_kind: 'provider', entity_id: 'provider', scan_at: b, endpoint_count: 2 },
    { entity_kind: 'provider', entity_id: 'other', scan_at: b, endpoint_count: 1 },
  ])
  expect(prepare({ previous: { ...next, scan_at: a }, next })).toEqual([])
  expect(prepare({ previous, next: scan(b, []) })).toEqual([])
})

test('endpoint loss, model non-detection, continued absence and reappearance remain distinct', () => {
  const rows = prepare({ previous: scan(a, populated), next: scan(b, endpointless) })
  expect(rows).toEqual([
    { entity_kind: 'model', entity_id: 'model', scan_at: b, detected: true, endpoint_count: 0 },
    { entity_kind: 'provider', entity_id: 'provider', scan_at: b, endpoint_count: 0 },
    {
      entity_kind: 'endpoint',
      entity_id: 'endpoint',
      scan_at: b,
      detected: false,
      model_id: 'model',
      provider_id: 'provider',
      provider_tag: 'provider',
    },
  ])
  expect(prepare({ previous: scan(a, endpointless), next: scan(b, []) })).toEqual([
    { entity_kind: 'model', entity_id: 'model', scan_at: b, detected: false, endpoint_count: 0 },
  ])
  expect(prepare({ previous: scan(a, []), next: scan(b, []) })).toEqual([])
  expect(prepare({ previous: scan(a, []), next: scan(b, populated) })).toEqual([
    { entity_kind: 'model', entity_id: 'model', scan_at: b, detected: true, endpoint_count: 1 },
    { entity_kind: 'provider', entity_id: 'provider', scan_at: b, endpoint_count: 1 },
    {
      entity_kind: 'endpoint',
      entity_id: 'endpoint',
      scan_at: b,
      detected: true,
      model_id: 'model',
      provider_id: 'provider',
      provider_tag: 'provider',
    },
  ])
  expect(prepare({ previous: scan(a, []), next: scan(b, endpointless) })).toEqual([
    { entity_kind: 'model', entity_id: 'model', scan_at: b, detected: true, endpoint_count: 0 },
  ])
})

test('a tag change retains endpoint identity without producing parent observations', () => {
  expect(
    prepare({
      previous: scan(a, populated),
      next: scan(b, [
        { model_id: 'model', endpoints: [{ ...endpoint, provider_tag: 'provider/fast' }] },
      ]),
    }),
  ).toEqual([
    {
      entity_kind: 'endpoint',
      entity_id: 'endpoint',
      scan_at: b,
      detected: true,
      model_id: 'model',
      provider_id: 'provider',
      provider_tag: 'provider/fast',
    },
  ])
})

test('endpoint reassignment records new relationships and both sides of the count change', () => {
  const models = [...populated, { model_id: 'other-model', endpoints: [] }]
  expect(
    prepare({
      previous: scan(a, models),
      next: scan(b, [
        ...endpointless,
        {
          model_id: 'other-model',
          endpoints: [{ ...endpoint, provider_id: 'other-provider' }],
        },
      ]),
    }),
  ).toEqual([
    { entity_kind: 'model', entity_id: 'model', scan_at: b, detected: true, endpoint_count: 0 },
    {
      entity_kind: 'model',
      entity_id: 'other-model',
      scan_at: b,
      detected: true,
      endpoint_count: 1,
    },
    { entity_kind: 'provider', entity_id: 'provider', scan_at: b, endpoint_count: 0 },
    { entity_kind: 'provider', entity_id: 'other-provider', scan_at: b, endpoint_count: 1 },
    {
      entity_kind: 'endpoint',
      entity_id: 'endpoint',
      scan_at: b,
      detected: true,
      model_id: 'other-model',
      provider_id: 'other-provider',
      provider_tag: 'other-provider',
    },
  ])
})

test('replacing an endpoint preserves relationship history even when parent counts are unchanged', () => {
  expect(
    prepare({
      previous: scan(a, populated),
      next: scan(b, [{ model_id: 'model', endpoints: [{ ...endpoint, id: 'replacement' }] }]),
    }),
  ).toEqual([
    {
      entity_kind: 'endpoint',
      entity_id: 'replacement',
      scan_at: b,
      detected: true,
      model_id: 'model',
      provider_id: 'provider',
      provider_tag: 'provider',
    },
    {
      entity_kind: 'endpoint',
      entity_id: 'endpoint',
      scan_at: b,
      detected: false,
      model_id: 'model',
      provider_id: 'provider',
      provider_tag: 'provider',
    },
  ])
})
