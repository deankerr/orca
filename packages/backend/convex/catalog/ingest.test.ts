import { expect, test } from 'bun:test'

import type { ScannedEndpoint, ScannedModel, ScannedProvider, Scan } from '#scan/model'

import * as events from '../events/prepare'
import * as pricing from '../history/pricing/ingest'
import type { JsonValue } from '../json'
import * as endpoints from './endpoints/ingest'
import * as models from './models/ingest'
import * as providers from './providers/ingest'

const from = '2026-09-28T10:00:00.000Z'
const to = '2026-09-28T11:00:00.000Z'

const model: ScannedModel = {
  id: 'author/model',
  variant: 'standard',
  slug: 'author/model',
  permaslug: 'author/model-20260928',
  short_name: 'Example model',
  created_at: '2026-09-28T00:00:00Z',
  input_modalities: ['text', 'image'],
  output_modalities: ['text'],
}

const provider: ScannedProvider = { provider_id: 'provider', displayName: 'Example provider' }

const endpoint: ScannedEndpoint = {
  id: 'endpoint-uuid',
  model_id: model.id,
  model_variant_slug: model.slug,
  provider_id: provider.provider_id,
  provider_tag: 'provider/bf16',
  provider_display_name: 'Provider endpoint label',
  variant: 'standard',
  pricing: {
    discount: 0,
    prompt: '0.000002',
    completion: '0.000004',
    overrides: [{ threshold: 1000, prompt: '0.000003' }],
  },
  quantization: 'bf16',
  extra_data: { $source: 'upstream', 原名: '例' },
  supported_parameters: ['temperature', 'tools'],
}

function observation(
  scan_at: string,
  modelBody = model,
  providerBody = provider,
  endpointBody = endpoint,
): Scan {
  return {
    scan_at,
    models: new Map([[modelBody.id, modelBody]]),
    providers: new Map([[providerBody.provider_id, providerBody]]),
    endpoints: new Map([[endpointBody.id, endpointBody]]),
  }
}

test('catalog ignores object key order and string-array order and duplicates before storage encoding', () => {
  const previousMetadata = { $extension: { 原名: '例', tags: ['a', 'b'] } }
  const nextMetadata = { $extension: { tags: ['b', 'a', 'a'], 原名: '例' } }
  const pair = {
    previous: observation(
      from,
      { ...model, extra: previousMetadata },
      { ...provider, extra: previousMetadata },
      { ...endpoint, extra: previousMetadata },
    ),
    next: observation(
      to,
      { ...model, input_modalities: ['image', 'text', 'text'], extra: nextMetadata },
      { ...provider, extra: nextMetadata },
      {
        ...endpoint,
        supported_parameters: ['tools', 'temperature', 'tools'],
        extra: nextMetadata,
        stats: { throughput: 90 },
      },
    ),
  }
  const original = structuredClone(pair)

  expect(models.prepare(pair)).toEqual([])
  expect(providers.prepare(pair)).toEqual([])
  expect(endpoints.prepare(pair)).toEqual([])
  expect(pair).toEqual(original)
})

test('catalog retains meaningful metadata changes, including removals and ordered arrays', () => {
  const cases: [JsonValue, JsonValue][] = [
    [{ field: 'old' }, { field: null }],
    [{ field: null }, {}],
    [{ field: ['a'] }, { field: ['a', 'b'] }],
    [{ field: [1, 2] }, { field: [2, 1] }],
    [{ field: ['a', 1] }, { field: [1, 'a'] }],
    [{ field: [{ id: 'a' }, { id: 'b' }] }, { field: [{ id: 'b' }, { id: 'a' }] }],
    [{ field: {} }, { field: [] }],
  ]

  for (const [before, after] of cases) {
    const pair = {
      previous: observation(
        from,
        { ...model, extra: before },
        { ...provider, extra: before },
        { ...endpoint, extra: before },
      ),
      next: observation(
        to,
        { ...model, extra: after },
        { ...provider, extra: after },
        { ...endpoint, extra: after },
      ),
    }

    for (const rows of [models.prepare(pair), providers.prepare(pair), endpoints.prepare(pair)]) {
      expect(rows).toHaveLength(1)
      expect(rows[0]?.scan_at).toBe(to)
      expect(JSON.parse(rows[0]?.metadata_json ?? 'null')).toHaveProperty('extra', after)
    }
  }
})

test('catalog propagates model context and preserves endpoint facts on departure and reappearance', () => {
  const previous = observation(from)
  const next = observation(to, { ...model, short_name: 'Renamed model' })

  expect(endpoints.prepare({ previous, next })).toMatchObject([
    { model_display_name: 'Renamed model', scan_at: to },
  ])
  expect(events.prepare({ previous, next })).toMatchObject([
    { entity_kind: 'model', type: 'UPDATE' },
  ])
  expect(events.prepare({ previous, next })).toHaveLength(1)
  expect(pricing.prepare({ previous, next })).toEqual([])

  const absent: Scan = {
    scan_at: to,
    models: new Map(),
    providers: new Map(),
    endpoints: new Map(),
  }
  const removed = { previous, next: absent }
  expect(models.prepare(removed)).toEqual([])
  expect(providers.prepare(removed)).toEqual([])
  expect(pricing.prepare(removed)).toEqual([])
  expect(endpoints.prepare(removed)).toEqual([
    { ...endpoints.initialRows(previous)[0], unlisted_at: to },
  ])

  const added = { previous: absent, next: observation('2026-09-28T12:00:00.000Z') }
  expect(models.prepare(added)).toEqual(models.initialRows(added.next))
  expect(providers.prepare(added)).toEqual(providers.initialRows(added.next))
  expect(endpoints.prepare(added)).toEqual(endpoints.initialRows(added.next))
  expect(endpoints.prepare(added)[0]).not.toHaveProperty('unlisted_at')
  expect(pricing.prepare(added)).toEqual(pricing.initialRows(added.next))
})

test('catalog retains changes to models without endpoints independently of Events', () => {
  const previous = { ...observation(from), endpoints: new Map() }
  const next = { ...observation(to, { ...model, description: 'New facts' }), endpoints: new Map() }
  const pair = { previous, next }

  expect(models.prepare(pair)).toEqual(models.initialRows(next))
  expect(models.prepare(pair)).toHaveLength(1)
  expect(events.prepare(pair)).toEqual([])
})

test('pricing history, catalog, and Events share comparison rules for complete quotes', () => {
  const quote = { discount: 0, prompt: '0.000002' }
  const before = {
    ...quote,
    overrides: [{ utc_days: ['saturday', 'sunday'], $extra: { 原名: '例' }, prompt: '0.000001' }],
  }
  const equivalent = {
    ...quote,
    overrides: [
      { prompt: '0.000001', $extra: { 原名: '例' }, utc_days: ['sunday', 'saturday', 'saturday'] },
    ],
  }
  const previous = observation(from, model, provider, { ...endpoint, pricing: before })
  const pair = {
    previous,
    next: observation(to, model, provider, { ...endpoint, pricing: equivalent }),
  }
  const original = structuredClone(pair)

  expect(pricing.prepare(pair)).toEqual([])
  expect(endpoints.prepare(pair)).toEqual([])
  expect(events.prepare(pair)).toEqual([])
  expect(pair).toEqual(original)

  for (const after of [
    { ...equivalent, prompt: '0.0000020001' },
    { ...equivalent, discount: 1 },
    { ...quote, overrides: [{ ...before.overrides[0], utc_days: ['monday'] }] },
    { ...quote, overrides: [] },
    quote,
  ]) {
    const next = observation(to, model, provider, { ...endpoint, pricing: after })
    const history = pricing.prepare({ previous, next })
    const catalog = endpoints.prepare({ previous, next })

    expect(history).toEqual(pricing.initialRows(next))
    expect(history).toHaveLength(1)
    expect(catalog).toHaveLength(1)
    expect(catalog[0]?.pricing).toEqual(endpoints.initialRows(next)[0]?.pricing)

    const changes = events.prepare({ previous, next })
    const [event] = changes

    expect(changes).toHaveLength(1)

    if (event?.entity_kind !== 'endpoint' || event.context.pricing === undefined) {
      throw new Error('Expected endpoint pricing update')
    }

    expect(event.type).toBe('UPDATE')
    expect(event.context.pricing.before).toEqual(endpoints.initialRows(previous)[0]?.pricing)
    expect(history[0]).toEqual({
      endpoint_id: endpoint.id,
      scan_at: next.scan_at,
      ...event.context.pricing.after,
    })
  }
})

test('pricing retains override order and distinguishes absent overrides from an empty list', () => {
  const quote = { discount: 0, prompt: '0.000002' }
  const overrides = [
    { min_prompt_tokens: 1000, prompt: '0.000003' },
    { min_prompt_tokens: 2000, prompt: '0.000004' },
  ]

  for (const [before, after] of [
    [
      { ...quote, overrides },
      { ...quote, overrides: overrides.toReversed() },
    ],
    [quote, { ...quote, overrides: [] }],
    [{ ...quote, overrides: [] }, quote],
  ]) {
    const pair = {
      previous: observation(from, model, provider, { ...endpoint, pricing: before }),
      next: observation(to, model, provider, { ...endpoint, pricing: after }),
    }

    expect(pricing.prepare(pair)).toEqual(pricing.initialRows(pair.next))
    expect(pricing.prepare(pair)).toHaveLength(1)
    expect(endpoints.prepare(pair)).toHaveLength(1)
  }
})
