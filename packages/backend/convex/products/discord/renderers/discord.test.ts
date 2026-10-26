import * as R from 'remeda'
import { expect, vi, test } from 'vitest'

import type { EventRow as CatalogEvent } from '../../../catalog/tables/events'
import { compare } from '../../../compare'
import type { JsonValue } from '../../../json'
import { render as renderPrepared } from '../../feed/render'
import { curate } from '../../shared/alerts/curate'
import { prepare as prepareEvent } from '../../shared/alerts/prepare'
import { fieldLabel, presentChange } from '../../shared/alerts/present'
import { prepareBatch as prepareDiscordBatch } from '../prepare'
import type { DiscordUrls } from './card'
import { embedCard } from './card'
import { changeRow, escape, lifecycleMarker, presence, stackRows, valueChange } from './display'
import { delta, fieldChange, quote } from './fields'
import { renderDiscordBatch } from './index'
import { pricingChanges, priceList } from './pricing'

type EventRow = CatalogEvent & { previously_known?: boolean }

const urls = { logoOrigin: 'https://logos.orb.town', publicUrl: 'https://orca.orb.town' }

const context = {
  endpoint: {
    endpoint_id: 'abcdef-123',
    provider_display_name: 'Regional offering',
    provider_tag: 'provider/fp8',
  },
  model: { display_name: 'Model', model_id: 'author/model' },
  provider: { display_name: 'Provider', provider_id: 'provider' },
}

const snapshots = {
  endpoint: {
    endpoint_id: 'abcdef-123',
    input_modalities: ['text'],
    metadata: { model_variant_slug: 'author/model' },
    model_display_name: 'Model',
    model_id: 'author/model',
    model_or_created_at: '2026-09-30T01:00:00Z',
    model_permaslug: 'author/model',
    output_modalities: ['text'],
    pricing: { discount: 0, meters: {} },
    provider_display_name: 'Regional offering',
    provider_id: 'provider',
    provider_tag: 'provider/fp8',
    variant: 'standard',
  },
  model: {
    display_name: 'Model',
    input_modalities: ['text'],
    metadata: { description: 'A model.' },
    model_id: 'abcdef-123',
    or_created_at: '2026-09-30T01:00:00Z',
    output_modalities: ['text'],
    permaslug: 'author/model',
    slug: 'author/model',
    variant: 'standard',
  },
  provider: { display_name: 'Provider', metadata: { name: 'Provider' }, provider_id: 'provider' },
}

/** Discord's annotation for a count change, where higher is favorable. */
function countDelta(before: number, after: number): string {
  const presented = presentChange(
    { after, before, field: 'limit_rpm', kind: 'count' },
    { fractionDigits: 0 },
  )

  return presented.transition === 'updated' && presented.movement !== null
    ? delta(presented.movement)
    : ''
}

test('delta symbols distinguish favorable changes from unfavorable changes like legacy embeds', () => {
  expect(countDelta(100, 150)).toBe('▲50%')
  expect(countDelta(100, 50)).toBe('🔻50%')

  for (const [before, after, symbol] of [
    ['0.000001', '0.000002', '🔺'],
    ['0.000002', '0.000001', '▼'],
  ] as const) {
    expect(
      pricingChanges([{ after, before, field: 'pricing.input', kind: 'price' }]).join('\n'),
    ).toContain(symbol)
  }

  expect(countDelta(0, 10)).toBe('')
  expect(countDelta(10, 10)).toBe('')

  // An unquoted price is not a zero-price quote, so it has no delta.
  expect(
    pricingChanges([{ after: '0.000001', before: null, field: 'pricing.input', kind: 'price' }]),
  ).not.toContain('🔺')
})

test('update headings are sentences for every entity', async () => {
  for (const [entity_kind, before, after, heading] of [
    [
      'model',
      { supports_reasoning: false },
      { supports_reasoning: true },
      'Model **Model** updated.',
    ],
    [
      'endpoint',
      { quantization: 'fp8' },
      { quantization: 'fp16' },
      '**Regional offering** endpoint (abcdef) updated.',
    ],
    ['provider', { headquarters: 'US' }, { headquarters: 'GB' }, 'Provider **Provider** updated.'],
  ] as const) {
    const event: EventRow = {
      ...row({ metadata: before }, { metadata: after }),
      entity_kind,
    }

    const card = await renderDiscord(event, urls)

    expect(card?.embeds?.[0]?.description?.split('\n')[0]).toBe(heading)
  }
})

test('prices and other numeric fields share precision and reveal changes hidden by rounding', async () => {
  expect(fieldChange({ after: 0.142, before: 0.141953, field: 'limit_rpm', kind: 'count' })).toBe(
    '- **limit_rpm** ≈0.142 ▲',
  )
  expect(countDelta(1_000_000, 1_000_001)).toBe('▲')
  expect(countDelta(1_000_001, 1_000_000)).toBe('🔻')
  expect(countDelta(100, 100.0999)).toBe('▲')
  expect(countDelta(100, 100.1)).toBe('▲')
  expect(countDelta(100, 100.4999)).toBe('▲')
  expect(countDelta(100, 100.5)).toBe('▲1%')
  expect(countDelta(100, 108.49)).toBe('▲8%')
  expect(countDelta(100, 108.5)).toBe('▲9%')
  expect(countDelta(100, 81.4)).toBe('🔻19%')

  // oxlint-disable sort-keys -- Fixture key order sets the order of the rendered and compared price changes.
  const event = row(
    { pricing: { meters: { prompt: '0.00000000011', input_cache_read: '0.00000001708' } } },
    { pricing: { meters: { prompt: '0.00000000012', input_cache_read: '0.000000016156' } } },
  )

  // oxlint-enable sort-keys
  const captured = event.change_json
  const card = await renderDiscord(event, urls)
  const description = card?.embeds?.[0]?.description ?? ''

  expect(description).toContain('- **Input** ≈$0.0001 🔺9%\n- **Cache** $0.0171 → $0.0162 ▼5%')
  expect(description).not.toContain('~~')
  expect(description).not.toContain('◇')
  expect(description).not.toContain('0.016156')
  expect(event.change_json).toBe(captured)
  expect(render(event)).toMatchObject({
    changes: [
      { after: '0.00000000012', before: '0.00000000011' },
      { after: '0.000000016156', before: '0.00000001708' },
    ],
  })
})

test('display pieces compose consistently across changes and block children', () => {
  expect(fieldChange({ after: 'fp16', before: 'fp8', field: 'quantization', kind: 'text' })).toBe(
    changeRow('quantization', valueChange('fp8', 'fp16')),
  )

  expect(changeRow('quantization', 'fp8 → fp16')).toBe('- **quantization** fp8 → fp16')
  expect(changeRow('description', '> prose', { layout: 'block' })).toBe(
    '- **description**\n> prose',
  )
  expect(stackRows(['- **a** 1', '', '- **b**\n> quote', '- **c** 2', '- **d**\n> last'])).toBe(
    '- **a** 1\n- **b**\n> quote\n\n- **c** 2\n- **d**\n> last',
  )
  expect(presence('true', 'added')).toBe('true (new)')
  expect(presence('false', 'removed')).toBe('~~false~~ (removed)')
})

test('Discord keeps slug punctuation and renders raw final keys with lowercase pricing labels', async () => {
  expect(escape('qwen/qwen3.6-max-preview')).toBe('qwen/qwen3.6-max-preview')
  expect(escape('**literal**')).toBe('\\*\\*literal\\*\\*')

  for (const [path, label] of [
    ['reasoning_config.is_mandatory_reasoning', 'is_mandatory_reasoning'],
    ['reasoning_config.supported_reasoning_efforts', 'supported_reasoning_efforts'],
    ['data_policy.retains_prompts', 'retains_prompts'],
    ['quantization', 'quantization'],
    ['warning_message', 'warning_message'],
    ['pricing.input', 'input'],
  ]) {
    expect(fieldLabel(path ?? '')).toBe(label)
  }

  expect(fieldLabel('pricing.input')).toBe('input')
  expect(fieldLabel('pricing.input_cache_read')).toBe('cache_read')
  expect(fieldLabel('pricing.discount')).toBe('discount')

  const event: EventRow = {
    ...row(
      { metadata: { reasoning_config: { is_mandatory_reasoning: false }, warning_message: null } },
      {
        metadata: {
          reasoning_config: { is_mandatory_reasoning: true },
          warning_message: 'Preview only.',
        },
      },
    ),
    context: {
      model: { display_name: 'Qwen3.6 Max Preview', model_id: 'qwen/qwen3.6-max-preview' },
    },
    entity_kind: 'model',
  }

  const text = JSON.stringify(await renderDiscord(event, urls))

  const card = await renderDiscord(event, urls)

  expect(card?.embeds?.[0]?.author?.name).toBe('qwen/qwen3.6-max-preview')
  expect(text).not.toContain('reasoning_config')
  expect(text).toContain('- **is_mandatory_reasoning**')
  expect(text).toContain('- **⚠ warning_message** (new)\\n> Preview only.')
})

test('price changes list one rate per bullet in listing order, with family names and discount last', () => {
  expect(
    priceList([
      { after: '10%', annotation: '', change: 'added', path: 'pricing.discount' },
      { after: '$0.123', annotation: '▼', before: '$0.123', path: 'pricing.input_cache_read' },
      { after: '$2', annotation: '', before: '$1', path: 'pricing.web_search' },
      { annotation: '', before: '$0.50', change: 'removed', path: 'pricing.image_output' },
      { after: '$0.452', annotation: '▼', before: '$0.453', path: 'pricing.output' },
      { after: '$1.25', annotation: '', change: 'added', path: 'pricing.input_cache_write' },
    ]).split('\n'),
  ).toEqual([
    '- **Output** $0.453 → $0.452 ▼',
    '- **Cache** ≈$0.123 ▼',
    '- **Cache Write** $1.25 (new)',
    '- **Image Output** ~~$0.50~~ (removed)',
    '- **Web search** $1 → $2',
    '- **Discount** 10% (new)',
  ])
})

test('long prose excerpts include late replacements, additions, and removals', () => {
  const prefix = 'Unchanged model details. '.repeat(40)

  for (const [oldEnding, newEnding] of [
    ['Old constraint.', 'New constraint.'],
    ['', 'New constraint.'],
    ['Old constraint.', ''],
  ]) {
    const text = fieldChange({
      after: prefix + newEnding,
      before: prefix + oldEnding,
      field: 'description',
      kind: 'prose',
    })

    const [before, after] = text.split('\nBefore\n')[1]?.split('\n\nAfter\n') ?? []

    expect(before).not.toBe(after)
    expect(before).toContain(oldEnding)
    expect(after).toContain(newEnding)
    expect(text).toContain('[excerpt]')
    expect(text.length).toBeLessThan(1700)
  }

  expect(quote(`${prefix}Later facts.`)).not.toContain('Later facts.')

  expect(fieldChange({ after: 'New.', before: 'Old.', field: 'description', kind: 'prose' })).toBe(
    '- **description**\nBefore\n> Old.\n\nAfter\n> New.',
  )
})

test('quoted prose restores OpenRouter-relative links without changing absolute destinations', async () => {
  const description =
    'Try [Qwen](/qwen/qwen3.8-max-0902).\nSee [routing](/docs/routing#cost) or [source](https://example.com/page).'

  const event: EventRow = {
    ...row({ metadata: { description: 'Old.' } }, { metadata: { description } }),
    entity_kind: 'model',
  }

  const captured = event.change_json
  const text = JSON.stringify(await renderDiscord(event, urls))

  expect(text).toContain('[Qwen](https://openrouter.ai/qwen/qwen3.8-max-0902)')
  expect(text).toContain('[routing](https://openrouter.ai/docs/routing#cost)')
  expect(text).toContain('[source](https://example.com/page)')
  expect(text).toContain('\\n> See')
  expect(quote('[external](//example.com/page)')).toBe('> [external](//example.com/page)')
  expect(event.change_json).toBe(captured)
})

function row(before: JsonValue, after: JsonValue): Extract<EventRow, { entity_kind: 'endpoint' }> {
  const [change] = compare({ 'abcdef-123': before }, { 'abcdef-123': after })

  if (change === undefined) {
    throw new Error('Expected an event')
  }

  return {
    change_json: JSON.stringify(change),
    context,
    entity_id: 'abcdef-123',
    entity_kind: 'endpoint',
    scan_at: '2026-09-30T01:00:00Z',
    type: 'UPDATE',
  }
}

test('Discord prices preserve tiny magnitudes; identity and mentions survive serialization', async () => {
  const message = await renderDiscord(
    row(
      {
        metadata: { supports_reasoning: false },
        pricing: {
          meters: {
            completion: '0',
            input_cache_read: '0.000000000000000000001',
            prompt: '0.000000255',
          },
        },
      },
      {
        metadata: { supports_reasoning: true },
        pricing: {
          meters: {
            completion: '0.000001',
            input_cache_read: '0.000000000000000000002',
            prompt: '0.000000195',
          },
        },
      },
    ),
    urls,
  )

  const embed = message?.embeds?.[0]
  const description = embed?.description ?? ''

  expect(description).toContain('- **Input** $0.255 → $0.195 ▼24%')
  expect(description).toContain('$0.000000000000002')
  expect(description).toContain('▼24%')
  expect(description).toContain('🔺100%')
  expect(description).not.toContain('Infinity')
  expect(description).not.toContain('supports_reasoning')
  expect(embed?.author?.icon_url).toContain('/v1/avatar/author.webp')
  expect(embed?.footer?.icon_url).toContain('/v1/avatar/provider.webp')
  expect(embed?.footer?.text).toBe('provider/fp8')
  expect(description).not.toContain('provider/fp8')
  const endpointUrl = `${urls.publicUrl}/?q=author%2Fmodel&uuid=abcdef`
  expect(embed?.author?.url).toBe(endpointUrl)
  expect(embed?.author?.name).toBe('author/model')
  expect(description.split('\n')[0]).toBe('**Regional offering** endpoint (abcdef) updated.')
  expect(description).not.toContain(endpointUrl)
  expect(embed?.timestamp).toBe('2026-09-30T01:00:00.000Z')
  expect(message?.allowed_mentions).toEqual({ parse: [] })
})

test('Discord presents zero discount transitions as added/removed without rewriting event facts', async () => {
  for (const [before, after, expected] of [
    [0, 0.08, '- **Discount** 8% (new)'],
    [0.08, 0, '- **Discount** ~~8%~~ (removed)'],
    [0.08, 0.12, '- **Discount** 8% → 12%'],
  ] as const) {
    const event = row({ pricing: { discount: before } }, { pricing: { discount: after } })
    const captured = event.change_json

    const text = pricingChanges([
      { after, before, field: 'pricing.discount', kind: 'percent' },
    ]).join('\n')

    expect(text).toContain(expected)
    expect(text).not.toContain('pricing.discount')
    expect(text).not.toMatch(/[▲▼🔺🔻]/u)

    if (before === 0 || after === 0) {
      expect(text).not.toContain(' 0%')
      expect(text).not.toContain('▲')
      expect(text).not.toContain('▼')
    }

    expect(curate(event)).toMatchObject({
      changes: [{ after, before, field: 'pricing.discount', kind: 'percent' }],
    })

    expect(event.change_json).toBe(captured)
  }

  const freeCard = await renderDiscord(
    row({ pricing: { meters: { prompt: '0.000001' } } }, { pricing: { meters: { prompt: '0' } } }),
    urls,
  )

  const free = freeCard?.embeds?.[0]?.description

  expect(free).toContain('- **Input** $1.00 → $0.00')
  expect(free).not.toContain('removed')

  const combinedCard = await renderDiscord(
    row(
      {
        metadata: { is_disabled: false },
        pricing: {
          discount: 0.08,
          meters: { input_cache_read: '0.0000002', prompt: '0.000001' },
        },
      },
      {
        metadata: { is_disabled: true },
        pricing: { discount: 0, meters: { input_cache_read: '0.0000001', prompt: '0.000002' } },
      },
    ),
    urls,
  )

  const combined = combinedCard?.embeds?.[0]?.description ?? ''

  expect(combined).toContain('◇ **Pricing**')
  expect(combined).toContain('◇ **Details**')

  const table = combined.split('\n\n')[1]?.split('\n').slice(1) ?? []

  expect(table).toEqual([
    '- **Input** $1.00 → $2.00 🔺100%',
    '- **Cache** $0.20 → $0.10 ▼50%',
    '- **Discount** ~~8%~~ (removed)',
  ])
})

test('Discord presents unknown sides as additions and removals, escapes set members, and skips unpublished fields', async () => {
  const message = await renderDiscord(
    row(
      { metadata: { is_disabled: false, quantization: 'fp8', supported_parameters: ['seed'] } },
      { metadata: { limit_rpm: 0, quantization: null, supported_parameters: ['**tools**'] } },
    ),
    urls,
  )

  const text = message?.embeds?.[0]?.description

  expect(text).toContain('- **supported_parameters** \\*\\*tools\\*\\* (new) • ~~seed~~ (removed)')
  expect(text).toContain('- **quantization** ~~fp8~~ (removed)')
  expect(text).toContain('- **limit_rpm** 0 (new)')
  expect(text).toContain('- **is_disabled** ~~false~~ (removed)')

  expect(
    await renderDiscord(
      row({ metadata: { capacity_tpm: 1 } }, { metadata: { capacity_tpm: 2 } }),
      urls,
    ),
  ).toBeNull()
})

test('Discord lifecycle embeds use captured facts and oversized updates truncate', async () => {
  for (const kind of ['model', 'endpoint'] as const) {
    for (const type of ['ADD', 'REMOVE'] as const) {
      const event = {
        entity_id: 'abcdef-123',
        entity_kind: kind,
        type,
        ...R.pickBy({ previously_known: type === 'ADD' ? false : undefined }, R.isDefined),
        change_json: JSON.stringify({
          key: 'abcdef-123',
          type,
          value: {
            ...snapshots[kind],
            metadata: {
              context_length: 128_000,
              description: 'x'.repeat(1000),
              headquarters: 'Earth',
            },
          },
        }),
        context,
        scan_at: '2026-09-30T01:00:00Z',
      }

      const message = await renderDiscord(event, urls)

      const content = JSON.stringify(message)

      expect(message?.components).toBeUndefined()
      expect(message?.embeds).toHaveLength(1)
      expect(message?.embeds?.[0]?.footer?.text).toBe(
        kind === 'endpoint' ? 'provider/fp8' : undefined,
      )
      expect(message?.embeds?.[0]?.color).toBe(type === 'ADD' ? 0x22_c5_5e : 0xef_44_44)

      expect(content).toContain(
        {
          ADD: {
            endpoint: '✨ **Regional offering** endpoint (abcdef) discovered.',
            model: '"title":"✨ Model"',
          },
          REMOVE: {
            endpoint: '**Regional offering** endpoint (abcdef) unlisted.',
            model: 'Model **Model** has no more listed endpoints.',
          },
        }[type][kind],
      )

      // Unknown facts, such as an absent knowledge cutoff, are not described in the feed.
      expect(render(event)?.details.join('\n')).not.toContain('null')

      expect(message?.embeds?.[0]?.author?.name).toBe('author/model')

      // Departures announce absence only; arrivals describe the entity.
      if (type === 'REMOVE') {
        expect(message?.embeds?.[0]?.description).toBe(
          kind === 'model'
            ? 'Model **Model** has no more listed endpoints.'
            : '**Regional offering** endpoint (abcdef) unlisted.',
        )
      } else if (kind === 'model') {
        expect(content).toContain('excerpt')
      }
    }
  }

  const oversized = await renderDiscord(
    row(
      { metadata: { supported_parameters: [] } },
      {
        metadata: {
          supported_parameters: Array.from(
            { length: 20 },
            (_, index) => `${index}${'x'.repeat(500)}`,
          ),
        },
      },
    ),
    urls,
  )

  expect(oversized?.embeds?.[0]?.description?.length).toBeLessThanOrEqual(4096)
  expect(oversized?.embeds?.[0]?.description?.endsWith('...')).toBe(true)
})

test('entity templates use captured model and endpoint facts with one timestamp and safe links', async () => {
  const lifecycle = (
    kind: EventRow['entity_kind'],
    value: Record<string, JsonValue>,
  ): EventRow => ({
    change_json: JSON.stringify({
      key: 'abcdef-123',
      type: 'ADD',
      value: { ...snapshots[kind], ...value },
    }),
    context,
    entity_id: 'abcdef-123',
    entity_kind: kind,
    previously_known: false,
    scan_at: '2026-09-30T01:00:00Z',
    type: 'ADD',
  })

  const model = await renderDiscord(
    lifecycle('model', {
      input_modalities: ['image', 'text'],
      metadata: {
        description: 'Built on [a model](https://example.com/model).',
        supports_reasoning: true,
        warning_message: 'Preview only.',
      },
      output_modalities: ['text'],
    }),
    urls,
  )

  // Discoveries are ordinary embeds titled by name; facts sit directly above the description,
  // and every quote is followed by a blank line.
  expect(model?.components).toBeUndefined()
  expect(model?.embeds?.[0]).toMatchObject({
    author: { name: 'author/model', url: 'https://orca.orb.town/?q=author%2Fmodel' },
    color: 0x22_c5_5e,
    description:
      '- **Modalities** image, text → text • reasoning\n> Built on [a model](https://example.com/model).\n\n**⚠ Warning**\n> Preview only.',
    timestamp: '2026-09-30T01:00:00.000Z',
    title: '✨ Model',
  })

  const endpoint = await renderDiscord(
    lifecycle('endpoint', {
      metadata: {
        context_length: 128_000,
        data_policy: { retainsPrompts: false },
        max_completion_tokens: 4096,
        supported_parameters: ['tools', 'temperature'],
        supports_reasoning: true,
      },
      pricing: {
        discount: 0,
        meters: {
          audio: '0.000001',
          image: '0.000001',
          input_audio_cache: '0.000000000001',
          prompt: '0',
        },
      },
    }),
    urls,
  )

  const endpointText = JSON.stringify(endpoint)
  expect(endpoint?.embeds?.[0]?.description).toBe(
    '✨ **Regional offering** endpoint (abcdef) discovered.\n\n- **Context** 128K (4K)\n- **Input** $0.00\n- **Image** $0.001\n- **Audio** $1.00 • **Output** **Cache** $0.000001',
  )
  expect(endpointText).toContain('/v1/avatar/author.webp')
  expect(endpointText).toContain('/v1/avatar/provider.webp')
  expect(endpointText).not.toContain('discount')
  expect(endpointText).not.toContain('supports_reasoning')
  expect(endpointText).not.toContain('supported_parameters')
  expect(endpointText).not.toContain('tools, temperature')
  expect(endpointText).not.toContain('retains')
  expect(endpointText).not.toContain('max_completion_tokens')
})

test('endpoint listings list limits, price families, and affirmative data policies', async () => {
  const listing = (metadata: Record<string, JsonValue>, pricing: JsonValue): EventRow => ({
    change_json: JSON.stringify({
      key: 'abcdef-123',
      type: 'ADD',
      value: { ...snapshots.endpoint, metadata, pricing },
    }),
    context,
    entity_id: 'abcdef-123',
    entity_kind: 'endpoint',
    previously_known: true,
    scan_at: '2026-09-30T01:00:00Z',
    type: 'ADD',
  })

  const description = async (event: EventRow) => {
    const message = await renderDiscord(event, urls)

    return message?.embeds?.[0]?.description
  }

  expect(
    await description(
      listing(
        {
          context_length: 262_144,
          data_policy: { retainsPrompts: false, training: false },
          max_completion_tokens: 65_536,
          quantization: 'fp4',
        },
        {
          discount: 0,
          meters: {
            completion: '0.0000005',
            input_cache_read: '0.000000009',
            prompt: '0.00000002',
          },
        },
      ),
    ),
  ).toBe(
    '**Regional offering** endpoint (abcdef) relisted.\n\n- **Context** 262K (65K) • FP4\n- **Input** $0.02 • **Output** $0.50\n- **Cache** $0.009',
  )

  expect(
    await description(
      listing(
        {
          data_policy: { retainsPrompts: true, retentionDays: 30, training: true },
          max_completion_tokens: 1_048_576,
          quantization: 'unknown',
        },
        {
          discount: 0.5,
          meters: {
            image_output: '0.0025',
            input_cache_write: '0.0000025',
            input_cache_write_1h: '0.000005',
            prompt: '0.000002',
          },
        },
      ),
    ),
  ).toBe(
    '**Regional offering** endpoint (abcdef) relisted.\n\n- **Max output** 1.04M\n- **Input** $2.00 • **Discount** 50%\n- **Cache** **Write** $2.50 • **1Hr** $5.00\n- **Image** **Output** $2.50\n\n- Trains on prompts • Retains prompts: 30 days',
  )
})

test('prose updates use embeds, preserve warning facts, and truncate aggregate overflow', async () => {
  const event: EventRow = {
    ...row(
      { metadata: { description: 'Old.', warning_message: null } },
      { metadata: { description: 'New.', warning_message: 'Preview only.' } },
    ),
    entity_kind: 'model',
  }

  const message = await renderDiscord(event, urls)
  const text = JSON.stringify(message)

  expect(message?.components).toBeUndefined()
  expect(message?.embeds).toHaveLength(1)
  expect(text).toContain('Before\\n> Old.')
  expect(text).toContain('After\\n> New.')
  expect(text).toContain('Preview only.')
  expect(text).not.toContain('~~')

  expect(render(event)).toMatchObject({
    changes: [
      { after: 'New.', before: 'Old.', field: 'description' },
      { after: 'Preview only.', before: null, field: 'warning_message' },
    ],
  })

  const before = {
    metadata: {
      author_display_name: 'C'.repeat(1000),
      description: 'A'.repeat(1000),
      warning_message: 'B'.repeat(1000),
    },
  }

  const after = {
    metadata: {
      author_display_name: 'F'.repeat(1000),
      description: 'D'.repeat(1000),
      warning_message: 'E'.repeat(1000),
    },
  }

  const oversized = await renderDiscord({ ...row(before, after), entity_kind: 'model' }, urls)

  expect(oversized?.embeds?.[0]?.description?.length).toBeLessThanOrEqual(4096)
  expect(oversized?.embeds?.[0]?.description?.endsWith('...')).toBe(true)
})

test('provider discoveries are announced and departures only announce endpoint absence', async () => {
  for (const type of ['ADD', 'REMOVE'] as const) {
    const event: EventRow = {
      entity_id: 'provider',
      entity_kind: 'provider',
      type,
      ...R.pickBy({ previously_known: type === 'ADD' ? false : undefined }, R.isDefined),
      change_json: JSON.stringify({
        key: 'provider',
        type,
        value: {
          ...snapshots.provider,
          metadata: { dataPolicy: { training: true }, headquarters: 'Earth', name: 'Provider' },
        },
      }),
      context: { provider: context.provider },
      scan_at: '2026-09-30T01:00:00Z',
    }

    const message = await renderDiscord(event, urls)

    if (type === 'ADD') {
      expect(message?.embeds?.[0]?.description).toBe('✨ Provider **Provider** discovered.')
      expect(render(event)).toMatchObject({ previously_known: false, type: 'provider_added' })
    } else {
      expect(message?.components).toBeUndefined()
      expect(message?.embeds).toHaveLength(1)
      expect(message?.embeds?.[0]?.footer).toBeUndefined()

      expect(message?.embeds?.[0]).toMatchObject({
        color: 0xef_44_44,
        description: 'Provider **Provider** has no more listed endpoints.',
        timestamp: '2026-09-30T01:00:00.000Z',
      })

      expect(message?.embeds?.[0]?.author?.icon_url).toContain('/v1/avatar/provider.webp')
      expect(JSON.stringify(message)).not.toContain('Earth')
      expect(JSON.stringify(message)).not.toContain('training')
    }
  }
})

test('unclassified arrivals use neutral wording instead of claiming discovery or return', async () => {
  for (const entity_kind of ['model', 'provider', 'endpoint'] as const) {
    const event: EventRow = {
      change_json: JSON.stringify({
        key: 'unclassified',
        type: 'ADD',
        value: snapshots[entity_kind],
      }),
      context,
      entity_id: 'unclassified',
      entity_kind,
      scan_at: '2026-09-30T01:00:00Z',
      type: 'ADD',
    }

    const text = JSON.stringify({ discord: await renderDiscord(event, urls), feed: render(event) })

    expect(text.toLowerCase()).not.toContain('discovered')
    expect(text.toLowerCase()).not.toContain('relisted')
    expect(text).not.toContain('again')
    expect(text).not.toContain('✨')
    expect(text).toContain(entity_kind === 'endpoint' ? 'listed.' : 'now has listed endpoints')
  }
})

test('provider updates stay classic and include only legacy metadata and policy URLs', async () => {
  const policy = {
    privacyPolicyURL: 'https://example.com/privacy',
    retainsPrompts: true,
    termsOfServiceURL: 'https://example.com/terms',
    training: true,
  }

  const providerRow = (before: JsonValue, after: JsonValue): EventRow => ({
    ...row({ metadata: before }, { metadata: after }),
    entity_kind: 'provider',
  })

  // Exercise policy leaf changes and whole-object addition, removal, and null transitions.
  for (const [before, after] of [
    [
      { dataPolicy: { ...policy, privacyPolicyURL: 'https://old.example', training: false } },
      { dataPolicy: policy },
    ],
    [{}, { dataPolicy: policy }],
    [{ dataPolicy: policy }, {}],
    [{ dataPolicy: null }, { dataPolicy: policy }],
    [{ dataPolicy: policy }, { dataPolicy: null }],
  ] satisfies [JsonValue, JsonValue][]) {
    const event = providerRow(before, after)
    const captured = event.change_json
    const message = await renderDiscord(event, urls)
    const text = message?.embeds?.[0]?.description ?? ''

    expect(message?.components).toBeUndefined()
    expect(message?.embeds).toHaveLength(1)
    expect(text).toContain('- **privacy_policy_url** ')
    expect(text).not.toContain('training')
    expect(text).not.toContain('retainsPrompts')
    expect(event.change_json).toBe(captured)
    expect(JSON.stringify(render(event))).not.toContain('training')
  }

  const message = await renderDiscord(
    providerRow(
      {
        byokEnabled: false,
        datacenters: ['US'],
        headquarters: 'US',
        name: 'Old',
        statusPageUrl: 'https://old.example',
      },
      {
        byokEnabled: true,
        datacenters: ['AU'],
        headquarters: 'AU',
        name: 'New',
        statusPageUrl: `https://example.com/${'a'.repeat(120)}`,
      },
    ),
    urls,
  )

  const text = message?.embeds?.[0]?.description ?? ''

  expect(message?.components).toBeUndefined()

  for (const label of ['name', 'headquarters', 'datacenters', 'status_page_url']) {
    expect(text).toContain(`- **${label}**`)
  }

  // URLs too long to share a row strike the old value, and both stay clickable outside code spans.
  expect(text).toContain(
    `- **status_page_url**\n> ~~<https://old.example>~~\n> <https://example.com/${'a'.repeat(120)}>`,
  )

  expect(text).not.toContain('byok_enabled')

  for (const [before, after] of [
    [
      { byokEnabled: false, hasChatCompletions: false },
      { byokEnabled: true, hasChatCompletions: true },
    ],
    [{ dataPolicy: { training: false } }, { dataPolicy: { training: true } }],
    [{}, { dataPolicy: { training: true } }],
    [{ dataPolicy: { training: true } }, {}],
  ] satisfies [JsonValue, JsonValue][]) {
    expect(await renderDiscord(providerRow(before, after), urls)).toBeNull()
  }
})

test('endpoint and model updates are embeds whose rows carry no code spans', async () => {
  const endpoint = await renderDiscord(
    row(
      { metadata: { quantization: 'fp8' }, provider_tag: 'old' },
      { metadata: { quantization: 'fp16' }, provider_tag: 'tag'.repeat(50) },
    ),
    urls,
  )

  expect(endpoint?.components).toBeUndefined()
  expect(endpoint?.embeds).toHaveLength(1)
  expect(endpoint?.embeds?.[0]?.description).toContain(
    `- **tag**\n> ~~old~~\n> ${'tag'.repeat(50)}`,
  )
  expect(endpoint?.embeds?.[0]?.description).toContain('- **quantization** fp8 → fp16')
  expect(endpoint?.embeds?.[0]?.description).not.toContain('`')
  expect(endpoint?.embeds?.[0]?.footer?.text).toBe('provider/fp8')

  const model = await renderDiscord(
    {
      ...row({ metadata: { description: 'Old.' } }, { metadata: { description: 'New.' } }),
      entity_kind: 'model',
    },
    urls,
  )

  const text = JSON.stringify(model)

  expect(text).not.toContain('[orca.orb.town]')
  expect(model?.embeds?.[0]?.description).not.toContain('`')
  expect(model?.embeds?.[0]?.timestamp).toBe('2026-09-30T01:00:00.000Z')
})

test('blank text is unknown, so it renders as an addition or removal without rewriting the event', async () => {
  for (const blank of ['', '  \n\t']) {
    for (const [before, after] of [
      ['Warning.', blank],
      [blank, 'Warning.'],
    ] as const) {
      const event: EventRow = {
        ...row({ metadata: { warning_message: before } }, { metadata: { warning_message: after } }),
        entity_kind: 'model',
      }

      const captured = event.change_json
      const card = await renderDiscord(event, urls)
      const description = card?.embeds?.[0]?.description

      expect(description).toContain(
        before === blank
          ? '- **⚠ warning_message** (new)\n> Warning.'
          : '- **⚠ warning_message** (removed)\n> ~~Warning.~~',
      )
      expect(event.change_json).toBe(captured)
      expect(render(event)).toMatchObject({
        changes: [
          { after: after === blank ? null : after, before: before === blank ? null : before },
        ],
      })
    }
  }

  expect(
    fieldChange({ after: null, before: 'Old prose.', field: 'description', kind: 'prose' }),
  ).toBe('- **description** (removed)\n> ~~Old prose.~~')

  expect(
    fieldChange({ after: 'New prose.', before: null, field: 'description', kind: 'prose' }),
  ).toBe('- **description** (new)\n> New prose.')
})

test('endpoint reasoning-only changes are skipped while model reasoning remains visible', async () => {
  const event = row(
    { metadata: { supports_reasoning: false } },
    { metadata: { supports_reasoning: true } },
  )

  expect(await renderDiscord(event, urls)).toBeNull()

  const card = await renderDiscord({ ...event, entity_kind: 'model' }, urls)

  expect(card?.embeds?.[0]?.description).toContain('- **supports_reasoning** false → true')
})

test('endpoint output limits use max_output without changing the captured field name', async () => {
  const event = row(
    { metadata: { max_completion_tokens: 4096 } },
    { metadata: { max_completion_tokens: 8192 } },
  )

  const card = await renderDiscord(event, urls)

  expect(card?.embeds?.[0]?.description).toContain('- **max_output** 4,096 → 8,192 ▲100%')
  expect(render(event)).toMatchObject({ changes: [{ field: 'max_completion_tokens' }] })
})

test('one-hour cache writes survive curation and render without pricing units or branding', async () => {
  const event = row(
    { pricing: { meters: { input_cache_write_1h: '0.000002' } } },
    { pricing: { meters: { input_cache_write_1h: '0.000004' } } },
  )

  const message = await renderDiscord(event, urls)

  // Standing alone, a carried label names its family.
  expect(message?.embeds?.[0]?.description).toContain('- **Cache 1Hr** $2.00 → $4.00 🔺100%')
  expect(render(event)).toMatchObject({ changes: [{ field: 'pricing.input_cache_write_1h' }] })

  const lifecycle: EventRow = {
    ...event,
    change_json: JSON.stringify({
      key: event.entity_id,
      type: 'ADD',
      value: {
        ...snapshots.endpoint,
        pricing: { discount: 0, meters: { input_cache_write_1h: '0.000004', web_search: '0.01' } },
      },
    }),
    type: 'ADD',
  }

  const added = await renderDiscord(lifecycle, urls)
  // Without read or write rates, their labels introduce the one-hour write; web search is not listed.
  expect(added?.embeds?.[0]?.description).toContain('- **Cache** **Write** **1Hr** $4.00')
  expect(added?.embeds?.[0]?.description).not.toContain('$0.01')
  expect(added?.embeds?.[0]?.description).not.toContain('per ')

  expect(
    pricingChanges([{ after: '1e-6', before: null, field: 'pricing.input', kind: 'price' }]),
  ).toEqual(['- **Input** $1.00 (new)'])

  for (const payload of [message, added]) {
    expect(payload).not.toHaveProperty('username')
    expect(payload).not.toHaveProperty('avatar_url')
    expect(JSON.stringify(payload)).not.toContain('orb-logo')
  }
})

test('web search is a pricing row across updates, additions, and removals without token scaling', async () => {
  for (const [before, after, expected] of [
    [{ web_search: '0.001' }, { web_search: '0.002' }, '- **Web search** $0.001 → $0.002 🔺100%'],
    [{}, { web_search: '0.001' }, '- **Web search** $0.001 (new)'],
    [{ web_search: '0.001' }, {}, '- **Web search** ~~$0.001~~ (removed)'],
  ] as const) {
    const event = row({ pricing: { meters: before } }, { pricing: { meters: after } })
    const card = await renderDiscord(event, urls)
    const text = card?.embeds?.[0]?.description ?? ''

    expect(text).toContain(expected)
    expect(text).not.toContain('per ')
    expect(render(event)).toMatchObject({ changes: [{ field: 'pricing.web_search' }] })
  }
})

test('field kinds decide prose layout; cards add units and price lists', async () => {
  expect(
    fieldChange({ after: 'New.', before: 'Old.', field: 'warning_message', kind: 'prose' }),
  ).toBe('- **warning_message**\nBefore\n> Old.\n\nAfter\n> New.')

  expect(
    fieldChange({ after: 2, before: 1, field: 'data_policy.retention_days', kind: 'count' }),
  ).toBe('- **retention_days** 1 → 2 ▲100%')

  const event = row(
    { metadata: { data_policy: { retentionDays: 1 } } },
    { metadata: { data_policy: { retentionDays: 2 } } },
  )

  const card = await renderDiscord(event, urls)

  expect(card?.embeds?.[0]?.description).toContain('- **retention_days** 1 days → 2 days ▲100%')

  // A price that becomes unquoted is removed from the list.
  expect(
    pricingChanges([{ after: null, before: '0.000001', field: 'pricing.input', kind: 'price' }]),
  ).toEqual(['- **Input** ~~$1.00~~ (removed)'])
})

test('only discoveries carry a lifecycle marker', () => {
  for (const kind of ['model', 'provider', 'endpoint']) {
    expect(lifecycleMarker({ previously_known: false, type: `${kind}_added` })).toBe('✨ ')
    expect(lifecycleMarker({ previously_known: true, type: `${kind}_added` })).toBe('')
    expect(lifecycleMarker({ type: `${kind}_added` })).toBe('')
    expect(lifecycleMarker({ type: `${kind}_removed` })).toBe('')
    expect(lifecycleMarker({ type: `${kind}_updated` })).toBe('')
  }
})

test('array changes share one row and escape embedded Markdown instead of fenced blocks', () => {
  const text = fieldChange({
    added: ['tools', '`**literal**'],
    field: 'supported_parameters',
    kind: 'list',
    removed: ['seed'],
  })

  expect(text).toBe(
    `- **supported_parameters** tools, ${escape('`**literal**')} (new) • ~~seed~~ (removed)`,
  )
})

test('oversized card text logs and respects individual and total Discord limits', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    const message = embedCard('x'.repeat(10_000), {
      author: { iconURL: urls.logoOrigin, name: 'a'.repeat(1000), url: urls.publicUrl },
      color: 0,
      footer: { iconURL: urls.logoOrigin, text: 'f'.repeat(3000) },
      timestamp: '2026-10-01T00:00:00Z',
    })

    const embed = message.embeds?.[0]

    expect(embed?.author?.name).toHaveLength(256)
    expect(embed?.footer?.text).toHaveLength(2048)
    expect(
      (embed?.author?.name.length ?? 0) +
        (embed?.footer?.text.length ?? 0) +
        (embed?.description?.length ?? 0),
    ).toBe(6000)
    expect(embed?.description?.endsWith('...')).toBe(true)

    expect(errors).toHaveBeenCalledTimes(3)
    expect(
      errors.mock.calls.every(([logged]) => logged === '[discord] truncated card content'),
    ).toBe(true)
  } finally {
    errors.mockRestore()
  }
})

function render(source: EventRow) {
  const alert = prepareAlert(source)

  return alert === null ? null : renderPrepared(alert)
}

async function renderDiscord(source: EventRow, discordUrls: DiscordUrls) {
  const { alerts } = await prepareBatch([{ ...source, _id: 'test-event' }])

  return renderDiscordBatch(alerts, discordUrls)[0]?.message ?? null
}

async function prepareBatch(rows: (EventRow & { _id: string })[]) {
  return await prepareDiscordBatch(
    rows.map((source) => ({ event: prepareAlert(source), source_id: source._id })),
    async (candidates) => candidates.map(() => false),
  )
}

function prepareAlert(source: EventRow) {
  const alert = prepareEvent(source)

  return alert !== null && source.previously_known !== undefined
    ? { ...alert, previously_known: source.previously_known }
    : alert
}
