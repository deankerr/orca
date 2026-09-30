import { expect, test } from 'bun:test'

import { compare } from '../events/compare'
import { prepare } from '../events/prepare'
import type { EventRow } from '../events/query'
import type { Scan } from '../scan/extract'
import { render, renderPage } from './render'
import type { FeedEvent } from './render'

const context = {
  model: { model_id: 'author/model', display_name: 'Model' },
  provider: { provider_id: 'provider', display_name: 'Provider' },
  endpoint: {
    endpoint_id: 'endpoint',
    provider_tag: 'provider/fp8',
    provider_display_name: 'Regional offering',
  },
}

function update(before: unknown, after: unknown): EventRow {
  const [change] = compare({ endpoint: before }, { endpoint: after })
  if (change === undefined) {
    throw new Error('Expected a stored event')
  }
  return {
    scan_at: '2026-09-29T01:00:00.000Z',
    entity_kind: 'endpoint',
    entity_id: 'endpoint',
    type: 'UPDATE',
    context,
    change_json: JSON.stringify(change),
  }
}

test('curated updates retain precise values, presence, nulls, and membership while selecting native fields', () => {
  const row = update(
    {
      pricing: { discount: 0, meters: { prompt: '0.0000001', completion: '0.000002' } },
      metadata: {
        quantization: 'fp8',
        context_length: 128_000,
        supported_parameters: ['tools', 'temperature'],
        supports_reasoning: true,
        capacity_tpm: 10,
      },
    },
    {
      pricing: { discount: 0, meters: { prompt: '0.0000001001', input_cache_read: '0' } },
      metadata: {
        quantization: null,
        context_length: 256_000,
        limit_rpm: null,
        supported_parameters: ['tools', 'response_format'],
        supports_reasoning: false,
        capacity_tpm: 20,
        pricing_version_id: 'revision',
      },
    },
  )
  const stored = { ...row, _id: 'internal-id', _creationTime: 123 }
  const event = render(stored)
  expect(event?.type).toBe('endpoint_updated')
  if (event?.type !== 'endpoint_updated') {
    throw new Error('Expected a curated update')
  }
  expect(event.context).toEqual(context)
  expect(event).not.toHaveProperty('_id')
  expect(event).not.toHaveProperty('_creationTime')
  expect(event).not.toHaveProperty('change_json')
  expect(event.observed_at).toBe(row.scan_at)
  expect(event).not.toHaveProperty('scan_at')
  expect(event.changes).toHaveLength(8)
  for (const expected of [
    { type: 'field_updated', path: 'pricing.prompt', before: '0.0000001', after: '0.0000001001' },
    { type: 'field_removed', path: 'pricing.completion', before: '0.000002' },
    { type: 'field_added', path: 'pricing.input_cache_read', after: '0' },
    { type: 'field_updated', path: 'quantization', before: 'fp8', after: null },
    { type: 'field_updated', path: 'context_length', before: 128_000, after: 256_000 },
    { type: 'field_added', path: 'limit_rpm', after: null },
    {
      type: 'set_updated',
      path: 'supported_parameters',
      added: ['response_format'],
      removed: ['temperature'],
    },
    { type: 'field_updated', path: 'supports_reasoning', before: true, after: false },
  ] satisfies Extract<FeedEvent, { changes: unknown }>['changes']) {
    expect(event.changes).toContainEqual(expected)
  }
  expect(event.details).toContain(
    'Input price changed from $0.1 per million tokens to $0.1001 per million tokens.',
  )
  expect(event.details).toContain('Reasoning support changed from yes to no.')
  expect(event.details).toContain('Supported parameters added: "response_format".')
  expect(event.details).toContain('Supported parameters removed: "temperature".')
  expect(event.details).toContain('Output price was removed; previously $2 per million tokens.')
  expect(event.details).toContain('Cache-read price was added: $0 per million tokens.')
  expect(event.details).toContain('Quantization changed from "fp8" to null.')
})

test('lifecycle values for all entity kinds use native keys and captured context', () => {
  const empty: Scan = {
    scan_at: '2026-09-29T00:00:00.000Z',
    models: new Map(),
    providers: new Map(),
    endpoints: new Map(),
  }
  const present: Scan = {
    scan_at: '2026-09-29T01:00:00.000Z',
    models: new Map([
      [
        'author/model',
        {
          id: 'author/model',
          variant: 'standard',
          slug: 'author/model',
          permaslug: 'author/model-date',
          short_name: 'Model',
          created_at: '2026-01-01T00:00:00.000Z',
          input_modalities: ['text'],
          output_modalities: ['text'],
          description: 'Description',
          reasoning_config: {
            is_mandatory_reasoning: false,
            supported_reasoning_efforts: ['low'],
            hidden: true,
          },
        },
      ],
    ]),
    providers: new Map([
      [
        'provider',
        {
          provider_id: 'provider',
          displayName: 'Provider',
          dataPolicy: { privacyPolicyURL: 'https://example.com/privacy', hidden: true },
        },
      ],
    ]),
    endpoints: new Map([
      [
        'endpoint',
        {
          id: 'endpoint',
          model_id: 'author/model',
          provider_id: 'provider',
          provider_tag: 'provider/fp8',
          provider_display_name: 'Regional offering',
          model_variant_slug: 'author/model',
          variant: 'standard',
          pricing: {
            discount: 0,
            prompt: '0.0000001',
            overrides: [{ arbitrary: 'private-to-this-renderer' }],
          },
          supported_parameters: ['tools'],
          max_completion_tokens: 100,
          context_length: 200,
          data_policy: { training: false, canPublish: null, hidden: true },
          capacity_tpm: 10,
        },
      ],
    ]),
  }
  const additions = prepare({ previous: empty, next: present }).map(render)
  const removals = prepare({
    previous: present,
    next: { ...empty, scan_at: '2026-09-29T02:00:00.000Z' },
  }).map(render)
  for (const [index, addition] of additions.entries()) {
    if (addition === null || !('after' in addition)) {
      throw new Error('Expected arrival')
    }
    expect(removals[index]).toMatchObject({
      entity_id: addition.entity_id,
      entity_kind: addition.entity_kind,
      context: addition.context,
      observed_at: '2026-09-29T02:00:00.000Z',
      type: `${addition.entity_kind}_removed`,
      before: addition.after,
    })
    expect(removals[index]).not.toHaveProperty('after')
    expect(removals[index]?.summary).toContain('is no longer listed')
    expect(addition.after).not.toHaveProperty('metadata')
  }
  expect(additions[0]).toMatchObject({
    after: {
      id: 'author/model',
      short_name: 'Model',
      created_at: '2026-01-01T00:00:00.000Z',
      reasoning_config: { is_mandatory_reasoning: false, supported_reasoning_efforts: ['low'] },
    },
  })
  expect(additions[1]).toMatchObject({
    after: {
      displayName: 'Provider',
      dataPolicy: { privacyPolicyURL: 'https://example.com/privacy' },
    },
  })
  expect(additions[2]).toEqual({
    observed_at: present.scan_at,
    entity_kind: 'endpoint',
    entity_id: 'endpoint',
    context,
    type: 'endpoint_added',
    summary: 'Model is now listed on Regional offering (provider/fp8).',
    details: [
      'Input price: $0.1 per million tokens.',
      'Context length: 200.',
      'Maximum completion tokens: 100.',
      'Supported parameters: "tools".',
    ],
    after: {
      id: 'endpoint',
      model_id: 'author/model',
      provider_id: 'provider',
      provider_tag: 'provider/fp8',
      provider_display_name: 'Regional offering',
      variant: 'standard',
      pricing: { discount: 0, prompt: '0.0000001' },
      supported_parameters: ['tools'],
      max_completion_tokens: 100,
      context_length: 200,
      data_policy: { training: false, canPublish: null },
    },
  })
  const removal = removals.at(2)
  if (removal === undefined || removal === null) {
    throw new Error('Expected departure')
  }
  expect(removal.summary).toBe('Model is no longer listed on Regional offering (provider/fp8).')
  expect(removal.details).toContain('Input price when last observed: $0.1 per million tokens.')
  expect(removal.details).toContain('Supported parameters when last observed: "tools".')
})

test('nested fields are curated on addition/removal and empty pages retain native pagination metadata', () => {
  const added = render(
    update({ metadata: {} }, { metadata: { data_policy: { training: false, hidden: true } } }),
  )
  expect(added).toMatchObject({ changes: [{ path: 'data_policy', after: { training: false } }] })
  const removed = render(
    update({ metadata: { data_policy: { training: false, hidden: true } } }, { metadata: {} }),
  )
  expect(removed).toMatchObject({ changes: [{ path: 'data_policy', before: { training: false } }] })
  expect(
    render(
      update(
        { metadata: { data_policy: { training: false } } },
        { metadata: { data_policy: { training: null } } },
      ),
    ),
  ).toMatchObject({ changes: [{ path: 'data_policy.training', before: false, after: null }] })
  const ignored = update(
    { metadata: { capacity_tpm: 10, data_policy: { hidden: false } } },
    { metadata: { capacity_tpm: 20, data_policy: { hidden: true }, toString: 'upstream' } },
  )
  expect(
    renderPage({
      page: [ignored],
      isDone: false,
      continueCursor: 'next',
      splitCursor: 'split',
      pageStatus: 'SplitRequired',
    }),
  ).toEqual({
    page: [],
    isDone: false,
    continueCursor: 'next',
    splitCursor: 'split',
    pageStatus: 'SplitRequired',
  })
})

test('text preserves tiny prices and literal upstream content; malformed events fail visibly', () => {
  const row = update(
    {
      pricing: { meters: { prompt: '0.00000001' } },
      metadata: { provider_display_name: 'old_name' },
    },
    {
      pricing: { meters: { prompt: '0.000000000000000000001' } },
      metadata: { provider_display_name: 'new_`name`' },
    },
  )
  expect(render(row)?.details).toEqual([
    'Input price changed from $0.01 per million tokens to $0.000000000000001 per million tokens.',
    'Provider name changed from "old_name" to "new_`name`".',
  ])
  expect(() => render({ ...row, change_json: '{broken' })).toThrow()
  expect(() => render({ ...row, change_json: '{}' })).toThrow()
})

test('invalid event envelopes and incomplete selected changes cannot disappear during rendering', () => {
  const row = update({ metadata: { context_length: 100 } }, { metadata: { context_length: 200 } })
  for (const payload of [
    {
      key: 'another-endpoint',
      type: 'UPDATE',
      changes: [
        {
          key: 'metadata',
          type: 'UPDATE',
          changes: [{ key: 'context_length', type: 'UPDATE', oldValue: 100, value: 200 }],
        },
      ],
    },
    { key: 'endpoint', type: 'REMOVE', value: {} },
    { key: 'endpoint', type: 'UPDATE' },
    { key: 'endpoint', type: 'UPDATE', changes: [{ key: 'metadata', type: 'UPDATE' }] },
    {
      key: 'endpoint',
      type: 'UPDATE',
      changes: [
        {
          key: 'metadata',
          type: 'UPDATE',
          changes: [
            {
              key: 'supported_parameters',
              type: 'UPDATE',
              embeddedKey: '$value',
              changes: [{ key: 'tools', type: 'UPDATE', oldValue: 'tools', value: 'other' }],
            },
          ],
        },
      ],
    },
  ]) {
    expect(() => render({ ...row, change_json: JSON.stringify(payload) })).toThrow()
  }
})
