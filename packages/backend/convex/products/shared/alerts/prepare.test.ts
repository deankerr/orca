import type { PaginationResult } from 'convex/server'
import { expect, vi, test } from 'vitest'

import { encodePricing } from '../../../catalog/pricing'
import type { EventRow } from '../../../catalog/tables/events'
import { compare } from '../../../compare'
import type { JsonValue } from '../../../json'
import { prepareBatch as prepareDiscordBatch } from '../../discord/prepare'
import type { DiscordUrls } from '../../discord/renderers/card'
import { renderDiscordBatch } from '../../discord/renderers/index'
import { renderPage as renderAlertsPage, render as renderPrepared } from '../../feed/render'
import type { FeedEvent } from '../../feed/render'
import { curate } from './curate'
import { prepare as prepareAlert } from './prepare'

const context = {
  endpoint: {
    endpoint_id: 'endpoint',
    provider_display_name: 'Regional offering',
    provider_tag: 'provider/fp8',
  },
  model: { display_name: 'Model', model_id: 'author/model' },
  provider: { display_name: 'Provider', provider_id: 'provider' },
}

function update(
  before: JsonValue,
  after: JsonValue,
  id = 'endpoint',
): Extract<EventRow, { entity_kind: 'endpoint' }> {
  const [change] = compare({ [id]: before }, { [id]: after })

  if (change === undefined) {
    throw new Error('Expected a stored event')
  }

  return {
    change_json: JSON.stringify(change),
    context: { ...context, endpoint: { ...context.endpoint, endpoint_id: id } },
    entity_id: id,
    entity_kind: 'endpoint',
    scan_at: '2026-09-29T01:00:00.000Z',
    type: 'UPDATE',
  }
}

test('scheduled pricing suppresses unchanged overrides regardless of the price or discount movement', async () => {
  const urls = { logoOrigin: 'https://logos.orb.town', publicUrl: 'https://orca.orb.town' }
  const overrides = [{ prompt: '0.000001', utc_days: ['saturday', 'sunday'] }]
  const before = { discount: 0, meters: { prompt: '0.000001' }, overrides }
  const after = { discount: 0.5, meters: { prompt: '0.0001' }, overrides }
  const row = update({ pricing: before }, { pricing: after })
  row.context.pricing = { after: encodePricing(after), before: encodePricing(before) }
  const captured = row.change_json

  expect(curate(row)).not.toBeNull()
  expect(prepareAlert(row)).toBeNull()
  expect(render(row)).toBeNull()
  expect(await renderDiscord(row, urls)).toBeNull()
  expect(row.change_json).toBe(captured)

  // Old projections have no schedule evidence; do not infer it from today's Catalog.
  const { pricing: _pricing, ...legacyContext } = row.context
  const legacy = { ...row, context: legacyContext }
  expect(prepareAlert(legacy)).not.toBeNull()

  const metadataOnly = update(
    { metadata: { context_length: 100 } },
    { metadata: { context_length: 200 } },
  )

  expect(prepareAlert(metadataOnly)).toMatchObject({ changes: [{ path: 'context_length' }] })
})

test('schedule changes announce an opaque change, including introduction and removal without meter movement', async () => {
  const urls = { logoOrigin: 'https://logos.orb.town', publicUrl: 'https://orca.orb.town' }
  const schedule = [{ prompt: '0.000001', utc_days: ['saturday'] }]
  const changed = [{ extension: { future: true }, prompt: '0.000001', utc_days: ['sunday'] }]
  const base = { discount: 0, meters: { prompt: '0.000001' } }

  for (const [before, after] of [
    [base, { ...base, overrides: schedule }],
    [{ ...base, overrides: schedule }, base],
    [
      { ...base, overrides: schedule },
      { ...base, overrides: changed },
    ],
    [
      { ...base, overrides: schedule },
      { ...base, discount: 0.01, meters: { prompt: '0.000001001' }, overrides: changed },
    ],
  ]) {
    // oxlint-disable sort-keys -- Fixture key order sets the order of the compared change list asserted below.
    const row = update(
      { pricing: before, metadata: { context_length: 100 } },
      { pricing: after, metadata: { context_length: 200 } },
    )

    // oxlint-enable sort-keys
    row.context.pricing = { after: encodePricing(after), before: encodePricing(before) }
    const captured = row.change_json

    expect(prepareAlert(row)).toMatchObject({
      changes: [
        { path: 'pricing.overrides', type: 'field_changed' },
        { after: 200, before: 100, path: 'context_length', type: 'field_updated' },
      ],
    })
    expect(render(row)?.details).toEqual([
      'Price schedule changed.',
      'Context length changed from 100 to 200.',
    ])
    expect(JSON.stringify(await renderDiscord(row, urls))).toContain('Price schedule changed.')
    expect(row.change_json).toBe(captured)
  }

  const contextPrice = update(
    { pricing: { ...base, overrides: [{ min_prompt_tokens: 100, prompt: '0.000002' }] } },
    { pricing: { ...base, overrides: [{ min_prompt_tokens: 200, prompt: '0.000002' }] } },
  )

  expect(prepareAlert(contextPrice)).toBeNull()
})

test('schedule detection accepts open UTC conditions and keeps unknown context distinct from no schedule', () => {
  const cases: [Record<string, JsonValue>[], boolean][] = [
    [[{ utc_end: 1400, utc_start: 0 }], true],
    [[{ utc_days: ['saturday'] }], true],
    [[{ $extension: { 原名: '例' }, utc_future_condition: { arbitrary: true } }], true],
    [[{ utcExtension: null }], true],
    [[{ min_prompt_tokens: 200_000 }], false],
    [[], false],
  ]

  for (const [overrides, scheduled] of cases) {
    const before = { discount: 0, meters: { prompt: '1' }, overrides }
    const after = { ...before, meters: { prompt: '2' } }
    const row = update({ pricing: before }, { pricing: after })
    row.context.pricing = { after: encodePricing(after), before: encodePricing(before) }

    expect(curate(row)).toMatchObject({ pricing_is_scheduled: scheduled })
    expect(prepareAlert(row) === null).toBe(scheduled)
    expect(row).not.toHaveProperty('pricing_is_scheduled')
  }

  const legacy = update(
    { pricing: { meters: { prompt: '1' } } },
    { pricing: { meters: { prompt: '2' } } },
  )

  expect(curate(legacy)).not.toHaveProperty('pricing_is_scheduled')
  expect(prepareAlert(legacy)).not.toBeNull()
})

test('pricing notifications require a qualifying meter; invalid values cannot bypass the coarse rule', async () => {
  const urls = { logoOrigin: 'https://logos.orb.town', publicUrl: 'https://orca.orb.town' }

  for (const [before, after, visible] of [
    [{ prompt: '1' }, { prompt: '1.01999999999999999999' }, false],
    [{ prompt: '1' }, { prompt: '1.02' }, true],
    [{ prompt: '1' }, { prompt: '0.98' }, true],
    [{ prompt: '1e-400' }, { prompt: '1.019e-400' }, false],
    [{ prompt: '1e-400' }, { prompt: '1.02e-400' }, true],
    [{ completion: '1', prompt: '1' }, { completion: '1.5', prompt: '1.001' }, true],
    [{ completion: '1', prompt: '1' }, { completion: 'invalid', prompt: '1.001' }, false],
    [{ completion: '1', prompt: '1' }, { completion: 'invalid', prompt: '1.5' }, true],
    [{ prompt: '1' }, { prompt: null }, false],
    [{ prompt: 'invalid' }, { prompt: '1' }, false],
    [{ prompt: '1' }, { prompt: '' }, false],
    [{ prompt: '1' }, { prompt: 'Infinity' }, false],
    [{ prompt: '1' }, { prompt: '-1' }, false],
    [{}, { prompt: 'invalid' }, false],
    [{ prompt: 'invalid' }, {}, false],
    [{}, { prompt: '1' }, true],
    [{ prompt: '1' }, {}, true],
    [{ prompt: '0' }, { prompt: '1' }, true],
    [{ prompt: '1' }, { prompt: '0' }, true],
    [{}, { prompt: '0' }, false],
    [{ prompt: '0' }, {}, false],
  ] as const) {
    const row = update({ pricing: { meters: before } }, { pricing: { meters: after } })
    const captured = row.change_json

    expect(render(row) !== null).toBe(visible)
    expect((await renderDiscord(row, urls)) !== null).toBe(visible)
    expect(curate(row)).not.toBeNull()
    expect(row.change_json).toBe(captured)
  }

  const micro = update(
    { metadata: { context_length: 100 }, pricing: { discount: 0.1, meters: { prompt: '1' } } },
    { metadata: { context_length: 200 }, pricing: { discount: 0.11, meters: { prompt: '1.001' } } },
  )

  expect(render(micro)).toBeNull()
  expect(await renderDiscord(micro, urls)).toBeNull()
  const captured = curate(micro)

  expect(captured?.type === 'endpoint_updated' ? captured.changes : []).toContainEqual({
    after: 200,
    before: 100,
    path: 'context_length',
    type: 'field_updated',
  })
  expect(renderPage({ continueCursor: 'next', isDone: false, page: [micro] })).toEqual({
    continueCursor: 'next',
    isDone: false,
    page: [],
  })

  const discountOnly = update({ pricing: { discount: 0 } }, { pricing: { discount: 0.1 } })
  expect(render(discountOnly)).toBeNull()
  expect(await renderDiscord(discountOnly, urls)).toBeNull()

  const metadataOnly = update(
    { metadata: { context_length: 100 } },
    { metadata: { context_length: 200 } },
  )

  expect(render(metadataOnly)).not.toBeNull()
  expect(await renderDiscord(metadataOnly, urls)).not.toBeNull()
})

test('discount micro-adjustments suppress notifications before the relative price threshold', async () => {
  const urls = { logoOrigin: 'https://logos.orb.town', publicUrl: 'https://orca.orb.town' }

  for (const [before, after, priceBefore, priceAfter, visible] of [
    [0.82, 0.828, '0.238', '0.227', false],
    [0.883, 0.895, '0.198', '0.177', false],
    [0.8, 0.82, '1', '0.5', false],
    [0.82, 0.8, '0.5', '1', false],
    [0, 0.02, '1', '0.5', false],
    [0.02, 0, '0.5', '1', false],
    [0.8, 0.820001, '1', '0.5', true],
    [0.820001, 0.8, '0.5', '1', true],
    [0.8, 0.83, '1', '1.001', false],
    [0.8, 0.8, '1', '0.5', true],
  ] as const) {
    const row = update(
      { pricing: { discount: before, meters: { prompt: priceBefore } } },
      { pricing: { discount: after, meters: { prompt: priceAfter } } },
    )

    expect(render(row) !== null).toBe(visible)
    expect((await renderDiscord(row, urls)) !== null).toBe(visible)
    expect(curate(row)).not.toBeNull()
  }
})

test('curated updates retain precise values, presence, nulls, and membership while selecting native fields', () => {
  const row = update(
    {
      metadata: {
        capacity_tpm: 10,
        context_length: 128_000,
        quantization: 'fp8',
        supported_parameters: ['tools', 'temperature'],
        supports_reasoning: true,
      },
      pricing: { discount: 0, meters: { completion: '0.000002', prompt: '0.0000001' } },
    },
    {
      metadata: {
        capacity_tpm: 20,
        context_length: 256_000,
        limit_rpm: null,
        pricing_version_id: 'revision',
        quantization: null,
        supported_parameters: ['tools', 'response_format'],
        supports_reasoning: false,
      },
      pricing: { discount: 0, meters: { input_cache_read: '0', prompt: '0.0000001001' } },
    },
  )

  const stored = { ...row, _creationTime: 123, _id: 'internal-id' }
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
  expect(event.changes).toHaveLength(7)

  for (const expected of [
    { after: '0.0000001001', before: '0.0000001', path: 'pricing.prompt', type: 'field_updated' },
    { before: '0.000002', path: 'pricing.completion', type: 'field_removed' },
    { after: '0', path: 'pricing.input_cache_read', type: 'field_added' },
    { after: null, before: 'fp8', path: 'quantization', type: 'field_updated' },
    { after: 256_000, before: 128_000, path: 'context_length', type: 'field_updated' },
    { after: null, path: 'limit_rpm', type: 'field_added' },
    {
      added: ['response_format'],
      path: 'supported_parameters',
      removed: ['temperature'],
      type: 'set_updated',
    },
  ] satisfies Extract<FeedEvent, { changes: unknown }>['changes']) {
    expect(event.changes).toContainEqual(expected)
  }

  expect(event.details).toContain('Input price is approximately $0.10 (increased by 0.1%).')
  expect(event.details).not.toContain('Reasoning support changed from yes to no.')
  expect(event.details).toContain('Supported parameters added: "response_format".')
  expect(event.details).toContain('Supported parameters removed: "temperature".')
  expect(event.details).toContain('Output price was removed; previously $2.00.')
  expect(event.details).toContain('Cache-read price was added: $0.00.')
  expect(event.details).toContain('Quantization changed from "fp8" to null.')
})

test('nested fields are curated on addition/removal and empty pages retain native pagination metadata', () => {
  const added = render(
    update({ metadata: {} }, { metadata: { data_policy: { hidden: true, training: false } } }),
  )

  expect(added).toMatchObject({ changes: [{ after: { training: false }, path: 'data_policy' }] })

  const removed = render(
    update({ metadata: { data_policy: { hidden: true, training: false } } }, { metadata: {} }),
  )

  expect(removed).toMatchObject({ changes: [{ before: { training: false }, path: 'data_policy' }] })

  expect(
    render(
      update(
        { metadata: { data_policy: { training: false } } },
        { metadata: { data_policy: { training: null } } },
      ),
    ),
  ).toMatchObject({ changes: [{ after: null, before: false, path: 'data_policy.training' }] })

  const ignored = update(
    { metadata: { capacity_tpm: 10, data_policy: { hidden: false } } },
    { metadata: { capacity_tpm: 20, data_policy: { hidden: true }, toString: 'upstream' } },
  )

  expect(
    renderPage({
      continueCursor: 'next',
      isDone: false,
      page: [ignored],
      pageStatus: 'SplitRequired',
      splitCursor: 'split',
    }),
  ).toEqual({
    continueCursor: 'next',
    isDone: false,
    page: [],
    pageStatus: 'SplitRequired',
    splitCursor: 'split',
  })
})

test('text preserves tiny prices and literal upstream content; malformed events fail visibly', () => {
  // oxlint-disable sort-keys -- Fixture key order sets the order of the detail lines asserted below.
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
  // oxlint-enable sort-keys

  expect(render(row)?.details).toEqual([
    'Input price changed from $0.01 to $0.000000000000001.',
    'Provider name changed from "old_name" to "new_`name`".',
  ])

  expect(() => curate({ ...row, change_json: '{broken' })).toThrow()
  expect(() => curate({ ...row, change_json: '{}' })).toThrow()
})

test('invalid event envelopes and incomplete selected changes cannot disappear during rendering', () => {
  const row = update({ metadata: { context_length: 100 } }, { metadata: { context_length: 200 } })

  for (const payload of [
    { key: 'endpoint', type: 'REMOVE', value: {} },
    { key: 'endpoint', type: 'UPDATE' },
    { changes: [{ key: 'metadata', type: 'UPDATE' }], key: 'endpoint', type: 'UPDATE' },
    {
      changes: [
        {
          changes: [
            {
              changes: [{ key: 'tools', oldValue: 'tools', type: 'UPDATE', value: 'other' }],
              embeddedKey: '$value',
              key: 'supported_parameters',
              type: 'UPDATE',
            },
          ],
          key: 'metadata',
          type: 'UPDATE',
        },
      ],
      key: 'endpoint',
      type: 'UPDATE',
    },
  ]) {
    expect(() => curate({ ...row, change_json: JSON.stringify(payload) })).toThrow()
  }
})

test('the stored row supplies root identity and operation without reconciling duplicate payload fields', () => {
  const row = update({ metadata: { context_length: 100 } }, { metadata: { context_length: 200 } })

  const payload = {
    changes: [
      {
        changes: [{ key: 'context_length', oldValue: 100, type: 'UPDATE', value: 200 }],
        key: 'metadata',
        type: 'UPDATE',
      },
    ],
    key: 'unused-copy',
    type: 'unused-copy',
  }

  expect(curate({ ...row, change_json: JSON.stringify(payload) })).toEqual(curate(row))
})

test('failed events are logged and omitted before batching; healthy events keep their residual changes', async () => {
  const before = { metadata: { context_length: 100, supported_parameters: ['tools', 'audio'] } }
  const after = { metadata: { context_length: 100, supported_parameters: ['tools'] } }

  const good = Array.from({ length: 5 }, (_, index) => ({
    ...update(
      before,
      index === 0 ? { metadata: { ...after.metadata, context_length: 200 } } : after,
      `endpoint-${index}`,
    ),
    _id: `event-${index}`,
  }))

  const unsupported = {
    ...update(
      before,
      { metadata: { context_length: 300, supported_parameters: [{ name: 'tools' }] } },
      'bad-endpoint',
    ),
    _id: 'unsupported-event',
  }

  const malformed = { ...unsupported, _id: 'malformed-event', change_json: '{broken' }

  const missingValue = {
    ...unsupported,
    _id: 'missing-value-event',
    change_json: JSON.stringify({
      changes: [
        {
          changes: [{ key: 'context_length', oldValue: 100, type: 'UPDATE' }],
          key: 'metadata',
          type: 'UPDATE',
        },
      ],
    }),
  }

  const bad = [unsupported, malformed, missingValue]
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const input = [...good.slice(0, 1), ...bad, ...good.slice(1)]
    const original = JSON.stringify(input)
    const result = await prepareBatch(input)

    expect(result.skipped).toBe(3)
    expect(result.alerts.map((alert) => alert.type)).toEqual(['batch', 'event'])
    expect(result.alerts[0]).toMatchObject({
      change: { path: 'supported_parameters' },
      type: 'batch',
    })
    expect(
      result.alerts[0]?.type === 'batch'
        ? result.alerts[0].members.map((member) => member.source_id)
        : [],
    ).toEqual(good.map((row) => row._id))
    expect(result.alerts[1]).toMatchObject({
      event: { changes: [{ after: 200, path: 'context_length' }] },
      source_id: 'event-0',
    })
    expect(JSON.stringify(input)).toBe(original)
    expect(log).toHaveBeenCalledTimes(3)

    for (const [index, row] of bad.entries()) {
      expect(log).toHaveBeenNthCalledWith(
        index + 1,
        '[alerts] could not prepare event',
        expect.objectContaining({
          entity_id: row.entity_id,
          scan_at: row.scan_at,
          source_id: row._id,
        }),
      )
    }

    expect(() => curate(unsupported)).toThrow('supported_parameters')
    expect(() => curate(missingValue)).toThrow('context_length')

    // A failed third entity cannot make two healthy entities eligible for a batch.
    const two = await prepareBatch([...good.slice(0, 2), unsupported])

    expect(two.alerts.every((alert) => alert.type === 'event')).toBe(true)

    expect(prepareAlert(unsupported)).toBeNull()
    expect(prepareAlert(unsupported)).toBeNull()

    const page = {
      continueCursor: 'next',
      isDone: false,
      page: input,
      pageStatus: 'SplitRequired' as const,
      splitCursor: 'split',
    }

    expect(renderPage(page)).toEqual({
      ...page,
      page: good.map(render).filter((event) => event !== null),
    })
  } finally {
    log.mockRestore()
  }
})

test('unselected external objects and indexed arrays remain valid captured data', () => {
  const row = update(
    { metadata: { context_length: 100, new_field: [{ nested: [1, 2] }] } },
    { metadata: { context_length: 200, new_field: [{ extra: { value: true }, nested: [3] }] } },
  )

  const alert = curate(row)

  expect(alert).toMatchObject({ changes: [{ after: 200, before: 100, path: 'context_length' }] })
  expect(alert?.type === 'endpoint_updated' ? alert.changes : []).toHaveLength(1)
})

function render(row: EventRow) {
  const alert = prepareAlert(row)

  return alert === null ? null : renderPrepared(alert)
}

async function renderDiscord(row: EventRow, urls: DiscordUrls) {
  const { alerts } = await prepareBatch([{ ...row, _id: 'test-event' }])

  return renderDiscordBatch(alerts, urls)[0]?.message ?? null
}

async function prepareBatch(rows: (EventRow & { _id: string })[]) {
  return await prepareDiscordBatch(
    rows.map((row) => ({ event: prepareAlert(row), source_id: row._id })),
    async (candidates) => candidates.map(() => false),
  )
}

function renderPage(result: PaginationResult<EventRow>) {
  return renderAlertsPage({
    ...result,
    page: result.page.flatMap((row) => {
      const alert = prepareAlert(row)

      return alert === null ? [] : [alert]
    }),
  })
}
