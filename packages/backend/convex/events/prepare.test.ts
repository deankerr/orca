import { expect, test } from 'bun:test'

import type { JsonValue } from '../json'
import type { ScannedEndpoint, ScannedModel, ScannedProvider, Scan } from '../scan'
import { prepare } from './prepare'

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

test('pricing updates retain complete observed quotes without classifying schedules', () => {
  const cases: Record<string, JsonValue>[][] = [
    [{ utc_days: ['saturday', 'sunday'], prompt: '0.000001' }],
    [{ utc_future_condition: { arbitrary: true }, $extension: { 原名: '例' } }],
    [{ min_prompt_tokens: 200_000, prompt: '0.000001' }],
    [],
  ]

  for (const overrides of cases) {
    const before = {
      ...endpoint,
      pricing: { discount: 0, prompt: '0.000002', overrides: structuredClone(overrides) },
    }
    const next = { ...before, pricing: { ...before.pricing, prompt: '0.000004' } }
    const pair = {
      previous: observation(from, model, provider, before),
      next: observation(to, model, provider, next),
    }
    const input = structuredClone(pair)
    const rows = prepare(pair)
    const [row] = rows

    if (row?.entity_kind !== 'endpoint' || row.context.pricing === undefined) {
      throw new Error('Expected pricing update context')
    }

    expect(rows).toHaveLength(1)
    expect(row.context.pricing.before).toMatchObject({
      discount: 0,
      meters: { prompt: '0.000002' },
    })
    expect(row.context.pricing.after).toMatchObject({ discount: 0, meters: { prompt: '0.000004' } })
    expect(JSON.parse(row.context.pricing.before.overrides_json ?? 'null')).toEqual(overrides)
    expect(JSON.parse(row.context.pricing.after.overrides_json ?? 'null')).toEqual(overrides)
    expect(row).not.toHaveProperty('pricing_is_scheduled')
    expect(row.change_json).not.toContain('overrides')
    expect(pair).toEqual(input)

    const [removedSchedule] = prepare({
      previous: observation(from, model, provider, before),
      next: observation(to, model, provider, {
        ...before,
        pricing: { discount: 0, prompt: '0.000002' },
      }),
    })

    if (removedSchedule?.entity_kind !== 'endpoint') {
      throw new Error('Expected override removal event')
    }

    expect(removedSchedule.context.pricing?.before).toHaveProperty('overrides_json')
    expect(removedSchedule.context.pricing?.after).not.toHaveProperty('overrides_json')
  }
})

test('updates outside pricing do not duplicate pricing context', () => {
  const rows = prepare({
    previous: observation(from),
    next: observation(
      to,
      { ...model, short_name: 'Renamed' },
      { ...provider, displayName: 'Renamed provider' },
      { ...endpoint, quantization: 'fp8' },
    ),
  })

  expect(rows).toHaveLength(3)

  for (const row of rows) {
    expect(row.context).not.toHaveProperty('pricing')
    expect(row).not.toHaveProperty('pricing_is_scheduled')
  }
})

test('joint additions and removals carry full values and resolve all identities on the present side', () => {
  const empty: Scan = {
    scan_at: from,
    models: new Map(),
    providers: new Map(),
    endpoints: new Map(),
  }

  const added = prepare({ previous: empty, next: observation(to) })
  const removed = prepare({ previous: observation(from), next: { ...empty, scan_at: to } })

  expect(added.map((row) => row.entity_kind)).toEqual(['model', 'provider', 'endpoint'])
  expect(removed).toHaveLength(3)
  for (const rows of [added, removed]) {
    for (const row of rows) {
      expect(row).not.toHaveProperty('from_scan_at')
      expect(row.context).not.toHaveProperty('pricing')
      expect(row.scan_at).toBe(to)
      expect(row.type).toBe(rows === added ? 'ADD' : 'REMOVE')
      expect(JSON.parse(row.change_json)).toMatchObject({ key: row.entity_id, type: row.type })
    }
    const event = rows.find((row) => row.entity_kind === 'endpoint')

    expect(event?.context).toEqual({
      model: { model_id: model.id, display_name: 'Example model' },
      provider: { provider_id: provider.provider_id, display_name: 'Example provider' },
      endpoint: {
        endpoint_id: endpoint.id,
        provider_tag: endpoint.provider_tag,
        provider_display_name: 'Provider endpoint label',
      },
    })

    expect(JSON.parse(event?.change_json ?? 'null')).toMatchObject({
      value: {
        pricing: {
          discount: 0,
          meters: { prompt: '0.000002', completion: '0.000004' },
          overrides: [{ threshold: 1000, prompt: '0.000003' }],
        },
        metadata: { quantization: 'bf16', extra_data: { $source: 'upstream', 原名: '例' } },
      },
    })
  }
})

test('unchanged facts, reordered metadata sets, and endpoint stats produce no events', () => {
  const previous = observation(from)

  const next = observation(to, { ...model, input_modalities: ['image', 'text'] }, provider, {
    ...endpoint,
    supported_parameters: ['tools', 'temperature'],
    stats: { throughput: 90 },
  })

  const before = structuredClone({ previous, next })
  expect(prepare({ previous, next })).toEqual([])
  expect({ previous, next }).toEqual(before)
})

test('historical model metadata and record arrivals or departures do not produce events', () => {
  const historical: Scan = {
    ...observation(from),
    providers: new Map(),
    endpoints: new Map(),
  }

  const changed: Scan = {
    ...historical,
    scan_at: to,
    models: new Map([[model.id, { ...model, short_name: 'Changed historical name' }]]),
  }

  expect(prepare({ previous: historical, next: changed })).toEqual([])
  expect(prepare({ previous: historical, next: { ...changed, models: new Map() } })).toEqual([])
  expect(prepare({ previous: { ...historical, models: new Map() }, next: changed })).toEqual([])
})

test('partial departures and endpoint replacements preserve model and provider presence', () => {
  const replacement = { ...endpoint, id: 'replacement-uuid' }
  const previous = observation(from)
  const next = observation(to, model, provider, replacement)

  for (const replacementAlreadyListed of [false, true]) {
    if (replacementAlreadyListed) {
      previous.endpoints.set(replacement.id, replacement)
    }

    const pair = { previous, next }
    const rows = prepare(pair)

    expect(rows).toHaveLength(replacementAlreadyListed ? 1 : 2)
    expect(rows.every((row) => row.entity_kind === 'endpoint')).toBe(true)
  }
})

test('related renames stay separate; endpoint updates use next context with precise prices and nulls', () => {
  const previous = observation(from)
  const renamed = { ...model, short_name: 'Renamed model' }
  const renamedProvider = { ...provider, displayName: 'Renamed provider' }
  const next = observation(to, renamed, renamedProvider)
  expect(prepare({ previous, next }).map((row) => row.entity_kind)).toEqual(['model', 'provider'])

  next.endpoints.set(endpoint.id, {
    ...endpoint,
    pricing: {
      discount: 0,
      prompt: '0',
      completion: '0.000004',
      overrides: [{ threshold: 1000, prompt: '0.000003' }],
    },
    quantization: null,
  })

  const rows = prepare({ previous, next })
  expect(rows).toHaveLength(3)
  const event = rows.find((row) => row.entity_kind === 'endpoint')
  expect(event?.context.model.display_name).toBe('Renamed model')
  expect(event?.context.provider.display_name).toBe('Renamed provider')

  expect(JSON.parse(event?.change_json ?? 'null')).toEqual({
    key: endpoint.id,
    type: 'UPDATE',
    changes: [
      {
        key: 'pricing',
        type: 'UPDATE',
        changes: [
          {
            key: 'meters',
            type: 'UPDATE',
            changes: [{ key: 'prompt', type: 'UPDATE', oldValue: '0.000002', value: '0' }],
          },
        ],
      },
      {
        key: 'metadata',
        type: 'UPDATE',
        changes: [{ key: 'quantization', type: 'UPDATE', oldValue: 'bf16', value: null }],
      },
    ],
  })
})

test('relationship changes use the new model, normalized provider, and endpoint-local tag and label', () => {
  const next = observation(
    to,
    { ...model, id: 'other/model', short_name: 'Other model' },
    { provider_id: 'other', displayName: 'Other provider' },
    {
      ...endpoint,
      model_id: 'other/model',
      provider_id: 'other',
      provider_tag: 'other/fp8',
      provider_display_name: 'Other endpoint label',
    },
  )

  const event = prepare({ previous: observation(from), next }).find(
    (row) => row.entity_kind === 'endpoint',
  )

  expect(event?.context).toEqual({
    model: { model_id: 'other/model', display_name: 'Other model' },
    provider: { provider_id: 'other', display_name: 'Other provider' },
    endpoint: {
      endpoint_id: endpoint.id,
      provider_tag: 'other/fp8',
      provider_display_name: 'Other endpoint label',
    },
  })

  expect(JSON.parse(event?.change_json ?? 'null')).toMatchObject({
    key: endpoint.id,
    type: 'UPDATE',
    changes: [
      { key: 'model_id', oldValue: model.id, value: 'other/model' },
      { key: 'provider_id', oldValue: provider.provider_id, value: 'other' },
      { key: 'provider_tag', oldValue: endpoint.provider_tag, value: 'other/fp8' },
      { key: 'provider_display_name', value: 'Other endpoint label' },
    ],
  })

  next.providers.clear()

  expect(() => prepare({ previous: observation(from), next })).toThrow(
    'Event identity is missing from its observation',
  )
})
