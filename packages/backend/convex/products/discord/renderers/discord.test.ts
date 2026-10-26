import { ComponentType } from 'discord-api-types/v10'
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
import { embedCard, componentCard } from './card'
import { code, escape, fieldRow, lifecycleMarker, valueChange } from './display'
import { delta, fieldChange, factsText, fieldValue, quote } from './fields'
import { renderDiscordBatch } from './index'
import { pricingChanges, pricingTable } from './pricing'

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
  expect(countDelta(100, 150)).toBe('▲ 50%')
  expect(countDelta(100, 50)).toBe('🔻 50%')

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
      'Δ Model **Model** updated.',
    ],
    [
      'endpoint',
      { quantization: 'fp8' },
      { quantization: 'fp16' },
      'Δ **Regional offering** endpoint updated.',
    ],
    [
      'provider',
      { headquarters: 'US' },
      { headquarters: 'GB' },
      'Δ Provider **Provider** updated.',
    ],
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
    '`limit_rpm:` ≈`0.142` ▲',
  )
  expect(countDelta(1_000_000, 1_000_001)).toBe('▲')
  expect(countDelta(1_000_001, 1_000_000)).toBe('🔻')
  expect(countDelta(100, 100.0999)).toBe('▲')
  expect(countDelta(100, 100.1)).toBe('▲')
  expect(countDelta(100, 100.4999)).toBe('▲')
  expect(countDelta(100, 100.5)).toBe('▲ 1%')
  expect(countDelta(100, 108.49)).toBe('▲ 8%')
  expect(countDelta(100, 108.5)).toBe('▲ 9%')
  expect(countDelta(100, 81.4)).toBe('🔻 19%')

  // oxlint-disable sort-keys -- Fixture key order sets the order of the rendered and compared price changes.
  const event = row(
    { pricing: { meters: { prompt: '0.00000000011', input_cache_read: '0.00000001708' } } },
    { pricing: { meters: { prompt: '0.00000000012', input_cache_read: '0.000000016156' } } },
  )

  // oxlint-enable sort-keys
  const captured = event.change_json
  const card = await renderDiscord(event, urls)
  const description = card?.embeds?.[0]?.description ?? ''

  expect(description).toContain('`input:     ` `≈ $0.0001` 🔺 9%')
  expect(description).toContain('`cache_read:` `  $0.0171` → `  $0.0162` ▼ 5%')
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

test('display pieces compose consistently across facts, changes, pricing, and block children', () => {
  const change = valueChange(code('fp8'), code('fp16'))

  expect(fieldRow('quantization', change)).toBe('`quantization:` `fp8` → `fp16`')

  expect(fieldChange({ after: 'fp16', before: 'fp8', field: 'quantization', kind: 'text' })).toBe(
    fieldRow('quantization', change),
  )

  expect(
    factsText([{ field: 'quantization', kind: 'text', value: 'fp16' }], ['quantization']),
  ).toBe('`quantization:` `fp16`')

  expect(
    pricingTable([
      { after: '$0.5', annotation: '▼ 50%', before: '$1', path: 'pricing.input' },
      { after: '$0.1', annotation: '', change: 'added', path: 'pricing.input_cache_read' },
    ]),
  ).toBe('`input:       ` `  $1` → `$0.5` ▼ 50%\n+ `cache_read:` `$0.1`')

  expect(fieldRow('description', '> prose', { layout: 'block' })).toBe('`description`\n> prose')

  expect(fieldRow('parameters', '+ `tools`', { layout: 'block' })).toBe('`parameters`\n+ `tools`')

  expect(fieldRow('enabled', code('true'), { change: 'added' })).toBe('+ `enabled:` `true`')
  expect(fieldRow('enabled', code('false'), { change: 'removed' })).toBe(
    '− ~~`enabled:`~~ ~~`false`~~',
  )
  expect(code('long_value', { width: 3 })).toBe('`long_value`')
  expect(code('a`b')).toBe('a\\`b')
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
  expect(text).toContain('`is_mandatory_reasoning:`')
  expect(text).toContain('⚠ + `warning_message`\\n> Preview only.')
})

test('pricing uses separate value spans without reserving blank old-value columns', () => {
  const lines = pricingTable([
    { after: '$0.452', annotation: '▼', before: '$0.453', path: 'pricing.input' },
    { after: '$0.123', annotation: '▼', before: '$0.123', path: 'pricing.input_cache_read' },
    { after: '24%', annotation: '', change: 'added', path: 'pricing.discount' },
  ]).split('\n')

  expect(lines).toEqual([
    '`input:     ` `  $0.453` → `  $0.452` ▼',
    '`cache_read:` `≈ $0.123` ▼',
    '+ `discount:` `     24%`',
  ])
  expect(lines.every((line) => !line.includes('~~'))).toBe(true)
  expect(lines.map((line) => line.split('`')[3]?.length)).toEqual([8, 8, 8])
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
    '`description`\nBefore\n> Old.\n\nAfter\n> New.',
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

test('Discord pricing cells preserve tiny magnitudes; identity and mentions survive serialization', async () => {
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

  expect(description).toContain('`input:     `')
  expect(description).toContain('$0.000000000000002`')
  expect(description).toContain('▼ 24%')
  expect(description).toContain('🔺 100%')
  expect(description).not.toContain('Infinity')
  expect(description).not.toContain('supports_reasoning')
  expect(embed?.author?.icon_url).toContain('/v1/avatar/author.webp')
  expect(embed?.footer?.icon_url).toContain('/v1/avatar/provider.webp')
  expect(embed?.footer?.text).toBe('provider/fp8')
  expect(description).not.toContain('provider/fp8')
  const endpointUrl = `${urls.publicUrl}/?q=author%2Fmodel&uuid=abcdef`
  expect(embed?.author?.url).toBe(endpointUrl)
  expect(embed?.author?.name).toBe('author/model [abcdef]')
  expect(description).not.toContain('abcdef')
  expect(description).not.toContain(endpointUrl)
  expect(embed?.timestamp).toBe('2026-09-30T01:00:00.000Z')
  expect(message?.allowed_mentions).toEqual({ parse: [] })

  const numericCells = [
    ...(description.split('\n\n')[1] ?? '').matchAll(/`[^`]+` `(?<cell>[^`]+)`/gu),
  ].map((match) => match.groups?.cell?.length)

  expect(numericCells).toHaveLength(3)
  expect(new Set(numericCells).size).toBe(1)
})

test('Discord presents zero discount transitions as added/removed without rewriting event facts', async () => {
  for (const [before, after, expected] of [
    [0, 0.08, '+ `discount:` `8%`'],
    [0.08, 0, '− ~~`discount:`~~ ~~`8%`~~'],
    [0.08, 0.12, '`discount:` ` 8%` → `12%`'],
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
      expect(text).not.toContain('0%')
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

  expect(free).toContain('$0.00`')
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

  expect(table).toHaveLength(3)
  expect(table[2]).toBe('− ~~`discount:`~~ ~~`   8%`~~')
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

  expect(text).toContain('`supported_parameters`\n+ `**tools**`\n− ~~`seed`~~')
  expect(text).toContain('− ~~`quantization:`~~ ~~`fp8`~~')
  expect(text).toContain('+ `limit_rpm:` `0`')
  expect(text).toContain('− ~~`is_disabled:`~~ ~~`false`~~')

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

      if (kind === 'model' && type === 'ADD') {
        expect(message?.flags).toBe(32_768)
        expect(message?.embeds).toBeUndefined()
      } else {
        expect(message?.components).toBeUndefined()
        expect(message?.embeds).toHaveLength(1)

        expect(message?.embeds?.[0]?.footer?.text).toBe(
          kind === 'endpoint' ? 'provider/fp8' : undefined,
        )

        expect(message?.embeds?.[0]?.color).toBe(type === 'ADD' ? 0x22_c5_5e : 0xef_44_44)
      }

      expect(content).toContain(
        {
          ADD: { endpoint: '**Regional offering** endpoint discovered.', model: '✨' },
          REMOVE: {
            endpoint: '− **Regional offering** endpoint unlisted.',
            model: 'has no more listed endpoints',
          },
        }[type][kind],
      )

      // Unknown facts, such as an absent knowledge cutoff, are not described in the feed.
      expect(render(event)?.details.join('\n')).not.toContain('null')

      if (kind === 'model') {
        expect(content).toContain('excerpt')
      } else {
        expect(content).not.toContain('Last known endpoint details:')
        expect(message?.embeds?.[0]?.author?.name).toBe('author/model [abcdef]')
        expect(message?.embeds?.[0]?.description).not.toContain('abcdef')

        if (type === 'REMOVE') {
          expect(message?.embeds?.[0]?.description).toBe(
            '− **Regional offering** endpoint unlisted.',
          )
        }
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

  const modelText = JSON.stringify(model)
  expect(modelText).toContain('`image, text` → `text` • `reasoning`')
  expect(modelText).toContain('[a model](https://example.com/model)')
  expect(modelText).toContain('Preview only.')
  expect(modelText.match(/<t:/gu)).toHaveLength(1)
  expect(modelText.indexOf('`image, text`')).toBeLessThan(modelText.indexOf('> Built on'))
  const container = model?.components?.[0]
  expect(container?.type).toBe(ComponentType.Container)

  if (container?.type !== ComponentType.Container) {
    throw new Error('Expected a container')
  }

  expect(container.components).toHaveLength(1)
  const [section] = container.components
  expect(section?.type).toBe(ComponentType.Section)

  if (section?.type !== ComponentType.Section) {
    throw new Error('Expected a section')
  }

  expect(section.components).toHaveLength(1)

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
  expect(endpointText).toContain('128,000')
  expect(endpointText).toContain('4,096')
  expect(endpointText).toContain('$0.001')
  expect(endpointText).toContain('$0.000001')
  expect(endpointText).toContain('/v1/avatar/author.webp')
  expect(endpointText).toContain('/v1/avatar/provider.webp')
  expect(endpointText).not.toContain('discount')
  expect(endpointText).not.toContain('supports_reasoning')
  expect(endpointText).not.toContain('supported_parameters')
  expect(endpointText).not.toContain('tools, temperature')
  expect(endpointText).toContain('`max_output:` `4,096`')
  expect(endpointText).not.toContain('max_completion_tokens')
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
        description: '− Provider **Provider** has no more listed endpoints.',
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
    expect(text).toContain('`privacy_policy_url:`')
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

  for (const label of ['name:', 'headquarters:', 'datacenters', 'status_page_url:']) {
    expect(text).toContain(`\`${label}\``)
  }

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

test('endpoint updates remain embeds and inline code has no bold wrappers', async () => {
  const endpoint = await renderDiscord(
    row(
      { metadata: { quantization: 'fp8' }, provider_tag: 'old' },
      { metadata: { quantization: 'fp16' }, provider_tag: 'tag'.repeat(50) },
    ),
    urls,
  )

  expect(endpoint?.components).toBeUndefined()
  expect(endpoint?.embeds).toHaveLength(1)
  expect(endpoint?.embeds?.[0]?.description).toContain(`\`tag:\` \`old\` → \`${'tag'.repeat(50)}\``)
  expect(endpoint?.embeds?.[0]?.description).not.toContain('**`')
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
  expect(text).not.toContain('**`')
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
          ? '⚠ + `warning_message`\n> Warning.'
          : '⚠ − ~~`warning_message`~~\n> ~~Warning.~~',
      )
      expect(event.change_json).toBe(captured)
      expect(render(event)).toMatchObject({
        changes: [
          { after: after === blank ? null : after, before: before === blank ? null : before },
        ],
      })
    }
  }

  const list = (value: string[]) => ({
    field: 'supported_parameters',
    kind: 'list' as const,
    value,
  })

  expect(fieldValue(list(['tools', 'temperature']))).toBe('`tools, temperature`')
  expect(fieldValue(list([]))).toBe('`[]`')

  expect(
    fieldChange({ after: null, before: 'Old prose.', field: 'description', kind: 'prose' }),
  ).toBe('− ~~`description`~~\n> ~~Old prose.~~')

  expect(
    fieldChange({ after: 'New prose.', before: null, field: 'description', kind: 'prose' }),
  ).toBe('+ `description`\n> New prose.')
})

test('endpoint reasoning-only changes are skipped while model reasoning remains visible', async () => {
  const event = row(
    { metadata: { supports_reasoning: false } },
    { metadata: { supports_reasoning: true } },
  )

  expect(await renderDiscord(event, urls)).toBeNull()

  const card = await renderDiscord({ ...event, entity_kind: 'model' }, urls)

  expect(card?.embeds?.[0]?.description).toContain('`supports_reasoning:` `false` → `true`')
})

test('endpoint output limits use max_output without changing the captured field name', async () => {
  const event = row(
    { metadata: { max_completion_tokens: 4096 } },
    { metadata: { max_completion_tokens: 8192 } },
  )

  const card = await renderDiscord(event, urls)

  expect(card?.embeds?.[0]?.description).toContain('`max_output:` `4,096` → `8,192` ▲ 100%')
  expect(render(event)).toMatchObject({ changes: [{ field: 'max_completion_tokens' }] })
})

test('one-hour cache writes survive curation and render without pricing units or branding', async () => {
  const event = row(
    { pricing: { meters: { input_cache_write_1h: '0.000002' } } },
    { pricing: { meters: { input_cache_write_1h: '0.000004' } } },
  )

  const message = await renderDiscord(event, urls)

  expect(message?.embeds?.[0]?.description).toContain('`cache_write_1h:` `$2.00` → `$4.00` 🔺 100%')
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
  expect(added?.embeds?.[0]?.description).toContain('`cache_write_1h:` `$4.00`')
  expect(added?.embeds?.[0]?.description).toContain('`web_search:    ` `$0.01`')
  expect(added?.embeds?.[0]?.description).not.toContain('per ')

  expect(
    pricingChanges([{ after: '1e-6', before: null, field: 'pricing.input', kind: 'price' }]),
  ).toEqual(['+ `input:` `$1.00`'])

  for (const payload of [message, added]) {
    expect(payload).not.toHaveProperty('username')
    expect(payload).not.toHaveProperty('avatar_url')
    expect(JSON.stringify(payload)).not.toContain('orb-logo')
  }
})

test('web search is a pricing row across updates, additions, and removals without token scaling', async () => {
  for (const [before, after, expected] of [
    [{ web_search: '0.001' }, { web_search: '0.002' }, '`web_search:` `$0.001` → `$0.002` 🔺 100%'],
    [{}, { web_search: '0.001' }, '+ `web_search:` `$0.001`'],
    [{ web_search: '0.001' }, {}, '− ~~`web_search:`~~ ~~`$0.001`~~'],
  ] as const) {
    const event = row({ pricing: { meters: before } }, { pricing: { meters: after } })
    const card = await renderDiscord(event, urls)
    const text = card?.embeds?.[0]?.description ?? ''

    expect(text).toContain(expected)
    expect(text).not.toContain('per ')
    expect(render(event)).toMatchObject({ changes: [{ field: 'pricing.web_search' }] })
  }
})

test('field kinds decide prose layout; cards add units and price tables', async () => {
  expect(
    fieldChange({ after: 'New.', before: 'Old.', field: 'warning_message', kind: 'prose' }),
  ).toBe('`warning_message`\nBefore\n> Old.\n\nAfter\n> New.')

  expect(
    fieldChange({ after: 2, before: 1, field: 'data_policy.retention_days', kind: 'count' }),
  ).toBe('`retention_days:` `1` → `2` ▲ 100%')

  const event = row(
    { metadata: { data_policy: { retentionDays: 1 } } },
    { metadata: { data_policy: { retentionDays: 2 } } },
  )

  const card = await renderDiscord(event, urls)

  expect(card?.embeds?.[0]?.description).toContain('`retention_days:` `1 days` → `2 days` ▲ 100%')

  // A price that becomes unquoted is removed from the table.
  expect(
    pricingChanges([{ after: null, before: '0.000001', field: 'pricing.input', kind: 'price' }]),
  ).toEqual(['− ~~`input:`~~ ~~`$1.00`~~'])
})

test('lifecycle markers distinguish arrivals, returns, departures, and routine updates', () => {
  for (const kind of ['model', 'provider', 'endpoint']) {
    expect(lifecycleMarker({ previously_known: false, type: `${kind}_added` })).toBe('✨ ')
    expect(lifecycleMarker({ previously_known: true, type: `${kind}_added` })).toBe('↺ ')
    expect(lifecycleMarker({ type: `${kind}_added` })).toBe('+ ')
    expect(lifecycleMarker({ type: `${kind}_removed` })).toBe('− ')
    expect(lifecycleMarker({ type: `${kind}_updated` })).toBe('Δ ')
  }
})

test('array changes use compact rows and escape embedded Markdown instead of fenced blocks', () => {
  const text = fieldChange({
    added: ['tools', '`**literal**'],
    field: 'supported_parameters',
    kind: 'list',
    removed: ['seed'],
  })

  expect(text).toContain('+ `tools`')
  expect(text).toContain('− ~~`seed`~~')
  expect(text).not.toContain('```')
  expect(text).toContain(code('`**literal**'))
})

test('pricing label widths include external addition and removal markers', () => {
  for (const change of ['added', 'removed'] as const) {
    const lines = pricingTable([
      { after: '$2', annotation: '', before: '$1', path: 'pricing.input' },
      { after: '$1', annotation: '', change, path: 'pricing.input_cache_read' },
      { after: '10%', annotation: '', change, path: 'pricing.discount' },
    ]).split('\n')

    const widths = lines.map((line) => {
      const label = line.split('`')[1] ?? ''

      return label.length + (line.startsWith('+ ') || line.startsWith('− ') ? 2 : 0)
    })

    expect(new Set(widths).size).toBe(1)
    expect(
      lines[1]?.startsWith(change === 'added' ? '+ `cache_read:`' : '− ~~`cache_read:`~~'),
    ).toBe(true)
  }
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

    const component = componentCard('x'.repeat(10_000), {
      color: 0,
      thumbnail: { description: 'a'.repeat(2000), url: urls.logoOrigin },
    })

    const container = component.components?.[0]

    if (container?.type !== ComponentType.Container) {
      throw new Error('Expected a container')
    }

    const [section] = container.components

    if (section?.type !== ComponentType.Section) {
      throw new Error('Expected a section')
    }

    expect(section.components[0]?.content).toHaveLength(3900)
    expect(
      section.accessory.type === ComponentType.Thumbnail ? section.accessory.description : null,
    ).toHaveLength(1024)
    expect(errors).toHaveBeenCalledTimes(5)
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
