import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import { ComponentType } from 'discord-api-types/v10'

import type { ActionCtx } from '../../../_generated/server'
import { broadcast, send, sendExamples } from '../../discord'
import { compare } from '../../events/compare'
import type { EventRow } from '../../events/query'
import { render } from '../render'
import { code, escape, field, valueChange } from './display'
import { fieldChange, factsText, fieldName, fieldValue, quote } from './fields'
import { renderDiscord } from './index'
import { priceLabel, pricingChanges, pricingTable } from './pricing'

const urls = { publicUrl: 'https://orca.orb.town', logoOrigin: 'https://logos.orb.town' }

const context = {
  model: { model_id: 'author/model', display_name: 'Model' },
  provider: { provider_id: 'provider', display_name: 'Provider' },
  endpoint: {
    endpoint_id: 'abcdef-123',
    provider_tag: 'provider/fp8',
    provider_display_name: 'Regional offering',
  },
}

test('display pieces compose consistently across facts, changes, pricing, and block children', () => {
  const change = valueChange(code('fp8'), code('fp16'))

  expect(field('quantization', change)).toBe('`quantization` ~~`fp8`~~ → `fp16`')

  expect(
    fieldChange({ type: 'field_updated', path: 'quantization', before: 'fp8', after: 'fp16' }),
  ).toBe(field('quantization', change))

  expect(factsText({ quantization: 'fp16' }, ['quantization'])).toBe('`quantization` `fp16`')

  expect(
    pricingTable([
      { path: 'pricing.prompt', before: '$1', after: '$0.5', annotation: '▼ 50%' },
      { path: 'pricing.input_cache_read', after: '$0.1', change: 'added', annotation: '' },
    ]),
  ).toBe('`input     ` ~~`  $1`~~ → `$0.5` ▼ 50%\n`cache_read` `$0.1` · new')

  expect(field('description', '> prose', { layout: 'block' })).toBe('`description`\n> prose')

  expect(field('parameters', '```diff\n+ tools\n```', { layout: 'block' })).toBe(
    '`parameters`\n```diff\n+ tools\n```',
  )

  expect(field('enabled', code('true'), { change: 'added' })).toBe('`enabled` `true` · new')
  expect(field('enabled', code('false'), { change: 'removed' })).toBe('~~`enabled`~~ ~~`false`~~')
  expect(code('long_value', { width: 3 })).toBe('`long_value`')
  expect(code('a`b')).toBe('a\\`b')
})

test('Discord keeps slug punctuation and renders raw final keys with lowercase pricing labels', () => {
  expect(escape('qwen/qwen3.6-max-preview')).toBe('qwen/qwen3.6-max-preview')
  expect(escape('**literal**')).toBe('\\*\\*literal\\*\\*')

  for (const [path, label] of [
    ['reasoning_config.is_mandatory_reasoning', 'is_mandatory_reasoning'],
    ['reasoning_config.supported_reasoning_efforts', 'supported_reasoning_efforts'],
    ['dataPolicy.retainsPrompts', 'retainsPrompts'],
    ['quantization', 'quantization'],
    ['warning_message', 'warning_message'],
    ['pricing.prompt', 'prompt'],
  ]) {
    expect(fieldName(path ?? '')).toBe(label)
  }

  expect(priceLabel('pricing.prompt')).toBe('input')
  expect(priceLabel('pricing.input_cache_read')).toBe('cache_read')
  expect(priceLabel('pricing.discount')).toBe('discount')

  const event: EventRow = {
    ...row(
      { metadata: { warning_message: null, reasoning_config: { is_mandatory_reasoning: false } } },
      {
        metadata: {
          warning_message: 'Preview only.',
          reasoning_config: { is_mandatory_reasoning: true },
        },
      },
    ),
    entity_kind: 'model',
    context: {
      model: { model_id: 'qwen/qwen3.6-max-preview', display_name: 'Qwen3.6 Max Preview' },
    },
  }

  const text = JSON.stringify(renderDiscord(event, urls))

  expect(renderDiscord(event, urls)?.embeds?.[0]?.author?.name).toBe('qwen/qwen3.6-max-preview')
  expect(text).not.toContain('reasoning_config')
  expect(text).toContain('`is_mandatory_reasoning`')
  expect(text).toContain('`warning_message`')
})

test('long prose excerpts include late replacements, additions, and removals', () => {
  const prefix = 'Unchanged model details. '.repeat(40)

  for (const [oldEnding, newEnding] of [
    ['Old constraint.', 'New constraint.'],
    ['', 'New constraint.'],
    ['Old constraint.', ''],
  ]) {
    const text = fieldChange(
      {
        type: 'field_updated',
        path: 'description',
        before: prefix + oldEnding,
        after: prefix + newEnding,
      },
      { prose: true },
    )

    const [before, after] = text.split('\nBefore\n')[1]?.split('\n\nAfter\n') ?? []

    expect(before).not.toBe(after)
    expect(before).toContain(oldEnding)
    expect(after).toContain(newEnding)
    expect(text).toContain('[excerpt]')
    expect(text.length).toBeLessThan(1700)
  }

  expect(quote(`${prefix}Later facts.`)).not.toContain('Later facts.')

  expect(
    fieldChange(
      { type: 'field_updated', path: 'description', before: 'Old.', after: 'New.' },
      { prose: true },
    ),
  ).toBe('`description`\nBefore\n> Old.\n\nAfter\n> New.')
})

test('quoted prose restores OpenRouter-relative links without changing absolute destinations', () => {
  const description =
    'Try [Qwen](/qwen/qwen3.8-max-0902).\nSee [routing](/docs/routing#cost) or [source](https://example.com/page).'

  const event: EventRow = {
    ...row({ metadata: { description: 'Old.' } }, { metadata: { description } }),
    entity_kind: 'model',
  }

  const captured = event.change_json
  const text = JSON.stringify(renderDiscord(event, urls))

  expect(text).toContain('[Qwen](https://openrouter.ai/qwen/qwen3.8-max-0902)')
  expect(text).toContain('[routing](https://openrouter.ai/docs/routing#cost)')
  expect(text).toContain('[source](https://example.com/page)')
  expect(text).toContain('\\n> See')
  expect(quote('[external](//example.com/page)')).toBe('> [external](//example.com/page)')
  expect(event.change_json).toBe(captured)
})

test('manual delivery posts once, surfaces rejection, and refuses an unset webhook', async () => {
  type Handler = (ctx: ActionCtx, args: { event_id: string }) => Promise<string>

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise the registered action with only its runQuery dependency mocked.
  const handler = (send as unknown as { _handler: Handler })._handler

  let current = row({ metadata: { is_disabled: false } }, { metadata: { is_disabled: true } })

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This action only reads one captured event through runQuery.
  const ctx = {
    runQuery: async () => current,
  } as unknown as ActionCtx

  const settings = {
    ORCA_DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/test/token?thread_id=123',
    ORCA_PUBLIC_URL: urls.publicUrl,
    ENTITY_LOGO_SERVICE_ORIGIN: urls.logoOrigin,
  }

  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]))
  const request = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))

  try {
    Object.assign(process.env, settings)
    expect(await handler(ctx, { event_id: 'test-event' })).toBe('sent')
    expect(request).toHaveBeenCalledTimes(1)
    const target = request.mock.calls[0]?.[0]
    expect(target instanceof URL && target.search).toContain('thread_id=123&wait=true')
    expect(request.mock.calls[0]?.[1]?.method).toBe('POST')
    const body = request.mock.calls[0]?.[1]?.body
    const payload: unknown = typeof body === 'string' ? JSON.parse(body) : null

    expect(payload).toMatchObject({
      allowed_mentions: { parse: [] },
      content: '-# pre-alpha · event: test-event',
    })

    expect(payload).not.toHaveProperty('username')
    expect(payload).not.toHaveProperty('avatar_url')

    current = {
      ...current,
      type: 'ADD',
      change_json: JSON.stringify({
        type: 'ADD',
        key: current.entity_id,
        value: { metadata: {}, pricing: { meters: {} } },
      }),
    }

    expect(await handler(ctx, { event_id: 'test-event' })).toBe('sent')
    const richTarget = request.mock.calls[1]?.[0]
    expect(richTarget instanceof URL && richTarget.searchParams.has('with_components')).toBe(false)

    // Model discoveries use Components V2: debug text is a sibling, not part of the card.
    const modelEvent: EventRow = {
      ...current,
      entity_kind: 'model',
      context: { model: context.model },
      previously_known: false,
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Component delivery uses the same single-query action dependency.
    const componentCtx = { runQuery: async () => modelEvent } as unknown as ActionCtx
    await handler(componentCtx, { event_id: 'component-event' })
    const componentBody = request.mock.calls[2]?.[1]?.body

    const componentPayload: unknown =
      typeof componentBody === 'string' ? JSON.parse(componentBody) : null

    expect(componentPayload).not.toHaveProperty('content')

    expect(componentPayload).toMatchObject({
      components: [
        { type: ComponentType.Container },
        { type: ComponentType.TextDisplay, content: '-# pre-alpha · event: component-event' },
      ],
    })

    request.mockResolvedValue(new Response('rate limited', { status: 429 }))
    await rejects(handler(ctx, { event_id: 'test-event' }), /Discord webhook rejected/)
    expect(request).toHaveBeenCalledTimes(4)

    delete process.env.ORCA_DISCORD_WEBHOOK_URL
    await rejects(handler(ctx, { event_id: 'test-event' }), /Set ORCA_DISCORD_WEBHOOK_URL/)
    expect(request).toHaveBeenCalledTimes(4)
  } finally {
    request.mockRestore()
    for (const [key, old] of Object.entries(previous)) {
      if (old === undefined) {
        Reflect.deleteProperty(process.env, key)
      } else {
        process.env[key] = old
      }
    }
  }
})

test('gallery sends selected events sequentially with one-second gaps and stops on rejection', async () => {
  type Handler = (
    ctx: ActionCtx,
    args: { event_ids: string[] },
  ) => Promise<{ sent: number; skipped: number }>

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise the registered operator action with its query dependency mocked.
  const handler = (sendExamples as unknown as { _handler: Handler })._handler
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise the live entry point using the same batch context.
  const liveHandler = (broadcast as unknown as { _handler: Handler })._handler
  const args = { event_ids: ['first', 'second', 'third'] }
  const events: string[] = []
  const order: string[] = []

  const queryContext = {
    runQuery: async (_query: unknown, args: { event_id: string }) => {
      events.push(args.event_id)
      order.push('read')
      return row({ metadata: { is_disabled: false } }, { metadata: { is_disabled: true } })
    },
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Sending only reads the captured event through runQuery.
  const ctx = queryContext as unknown as ActionCtx

  const settings = {
    ORCA_DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/test/token',
    ORCA_DISCORD_PREVIEW_ENABLED: 'false',
    ORCA_PUBLIC_URL: urls.publicUrl,
    ENTITY_LOGO_SERVICE_ORIGIN: urls.logoOrigin,
  }

  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]))
  const originalTimeout = globalThis.setTimeout
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Preserve the timer API while accelerating the gallery's fixed waits in this test.
  const immediateTimeout = (callback: () => void) => {
    order.push('pause')
    return originalTimeout(callback, 0)
  }

  const pause = spyOn(globalThis, 'setTimeout').mockImplementation(
    Object.assign(immediateTimeout, originalTimeout),
  )

  const request = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))

  try {
    Object.assign(process.env, settings)
    expect(await liveHandler(ctx, args)).toEqual({ sent: 0, skipped: 0 })
    expect(request).not.toHaveBeenCalled()
    process.env.ORCA_DISCORD_PREVIEW_ENABLED = 'true'
    expect(await liveHandler(ctx, args)).toEqual({ sent: 3, skipped: 0 })
    expect(events).toEqual(args.event_ids)
    expect(pause.mock.calls.map((call) => call[1])).toEqual(Array.from({ length: 2 }, () => 1000))

    expect(order).toEqual(
      Array.from({ length: 5 }, (_, index) => (index % 2 === 0 ? 'read' : 'pause')),
    )

    request.mockResolvedValue(new Response('rate limited', { status: 429 }))
    await rejects(handler(ctx, args), /Discord webhook rejected/)
    expect(request).toHaveBeenCalledTimes(4)
    expect(pause).toHaveBeenCalledTimes(2)
  } finally {
    request.mockRestore()
    pause.mockRestore()

    for (const [key, old] of Object.entries(previous)) {
      if (old === undefined) {
        Reflect.deleteProperty(process.env, key)
      } else {
        process.env[key] = old
      }
    }
  }
})

function row(before: unknown, after: unknown): Extract<EventRow, { entity_kind: 'endpoint' }> {
  const [change] = compare({ 'abcdef-123': before }, { 'abcdef-123': after })

  if (change === undefined) {
    throw new Error('Expected an event')
  }

  return {
    entity_kind: 'endpoint',
    entity_id: 'abcdef-123',
    type: 'UPDATE',
    scan_at: '2026-09-30T01:00:00Z',
    context,
    change_json: JSON.stringify(change),
  }
}

test('Discord pricing cells align without rounding money; identity and mentions survive serialization', () => {
  const message = renderDiscord(
    row(
      {
        pricing: {
          meters: {
            prompt: '0.000000255',
            completion: '0',
            input_cache_read: '0.000000000000000000001',
          },
        },
        metadata: { supports_reasoning: false },
      },
      {
        pricing: {
          meters: {
            prompt: '0.000000195',
            completion: '0.000001',
            input_cache_read: '0.000000000000000000002',
          },
        },
        metadata: { supports_reasoning: true },
      },
    ),
    urls,
  )

  const embed = message?.embeds?.[0]
  const description = embed?.description ?? ''

  expect(description).toContain('`input     `')
  expect(description).toContain('$0.000000000000002`')
  expect(description).toContain('▼ 23.5%')
  expect(description).toContain('▲ 100%')
  expect(description).not.toContain('Infinity')
  expect(description).not.toContain('supports_reasoning')
  expect(embed?.author?.icon_url).toContain('/author.webp')
  expect(embed?.footer?.icon_url).toContain('/provider.webp')
  expect(embed?.footer?.text).toBe('provider/fp8')
  expect(description).not.toContain('provider/fp8')
  const endpointUrl = `${urls.publicUrl}/?q=author%2Fmodel&uuid=abcdef`
  expect(embed?.author?.url).toBe(endpointUrl)
  expect(description).toContain(`[\`abcdef\`](${endpointUrl})`)
  expect(embed?.timestamp).toBe('2026-09-30T01:00:00.000Z')
  expect(message?.allowed_mentions).toEqual({ parse: [] })

  const numericCells = [
    ...(description.split('\n\n')[1] ?? '').matchAll(/ → `(?<cell>[^`]+)`/g),
  ].map((match) => match.groups?.cell?.length)

  expect(new Set(numericCells).size).toBe(1)
})

test('Discord presents zero discount transitions as added/removed without rewriting event facts', () => {
  for (const [before, after, expected] of [
    [0, 0.08, '`discount` `8%` · new'],
    [0.08, 0, '~~`discount`~~ ~~`8%`~~'],
    [0.08, 0.12, '`discount` ~~` 8%`~~ → `12%` ▲ 50%'],
  ] as const) {
    const event = row({ pricing: { discount: before } }, { pricing: { discount: after } })
    const captured = event.change_json
    const text = renderDiscord(event, urls)?.embeds?.[0]?.description ?? ''

    expect(text).toContain(expected)
    expect(text).not.toContain('pricing.discount')

    if (before === 0 || after === 0) {
      expect(text).not.toContain('0%')
      expect(text).not.toContain('▲')
      expect(text).not.toContain('▼')
    }

    expect(render(event)).toMatchObject({
      changes: [{ type: 'field_updated', path: 'pricing.discount', before, after }],
    })

    expect(event.change_json).toBe(captured)
  }

  const free = renderDiscord(
    row({ pricing: { meters: { prompt: '0.000001' } } }, { pricing: { meters: { prompt: '0' } } }),
    urls,
  )?.embeds?.[0]?.description

  expect(free).toContain('$0`')
  expect(free).not.toContain('removed')

  const combined =
    renderDiscord(
      row(
        {
          pricing: {
            discount: 0.08,
            meters: { prompt: '0.000001', input_cache_read: '0.0000002' },
          },
          metadata: { is_disabled: false },
        },
        {
          pricing: { discount: 0, meters: { prompt: '0.000002', input_cache_read: '0.0000001' } },
          metadata: { is_disabled: true },
        },
      ),
      urls,
    )?.embeds?.[0]?.description ?? ''

  const table = combined.split('\n\n')[1]?.split('\n') ?? []

  expect(table).toHaveLength(3)
  expect(table[2]).toBe('~~`discount  `~~ ~~`  8%`~~')
})

test('Discord preserves absence, nulls and set changes, escapes markup, and skips unselected fields', () => {
  const message = renderDiscord(
    row(
      { metadata: { supported_parameters: ['seed'], quantization: 'fp8', is_disabled: false } },
      { metadata: { supported_parameters: ['**tools**'], quantization: null, limit_rpm: 0 } },
    ),
    urls,
  )

  const text = message?.embeds?.[0]?.description

  expect(text).toContain('```diff\n+ **tools**\n- seed\n```')
  expect(text).toContain('~~`fp8`~~ → `null`')
  expect(text).toContain('`limit_rpm` `0` · new')
  expect(text).toContain('~~`is_disabled`~~ ~~`false`~~')

  expect(
    renderDiscord(row({ metadata: { capacity_tpm: 1 } }, { metadata: { capacity_tpm: 2 } }), urls),
  ).toBeNull()
})

test('Discord lifecycle embeds use captured facts and oversized updates fail before delivery', () => {
  for (const kind of ['model', 'endpoint'] as const) {
    for (const type of ['ADD', 'REMOVE'] as const) {
      const event = {
        entity_kind: kind,
        entity_id: 'abcdef-123',
        type,
        ...(type === 'ADD' ? { previously_known: false } : {}),
        scan_at: '2026-09-30T01:00:00Z',
        context,
        change_json: JSON.stringify({
          type,
          key: 'abcdef-123',
          value: {
            pricing: { meters: {} },
            metadata: {
              description: 'x'.repeat(1000),
              headquarters: 'Earth',
              context_length: 128_000,
            },
          },
        }),
      }

      const message = renderDiscord(event, urls)

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
        type === 'ADD'
          ? kind === 'model'
            ? '✨'
            : 'Discovered'
          : kind === 'model'
            ? 'has no more listed endpoints'
            : 'Unlisted',
      )

      if (kind === 'model') {
        expect(content).toContain('excerpt')
      }
    }
  }

  expect(() =>
    renderDiscord(
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
    ),
  ).toThrow()
})

test('entity templates use captured model and endpoint facts with one timestamp and safe links', () => {
  const lifecycle = (kind: EventRow['entity_kind'], value: unknown): EventRow => ({
    entity_kind: kind,
    entity_id: 'abcdef-123',
    type: 'ADD',
    previously_known: false,
    scan_at: '2026-09-30T01:00:00Z',
    context,
    change_json: JSON.stringify({ key: 'abcdef-123', type: 'ADD', value }),
  })

  const model = renderDiscord(
    lifecycle('model', {
      input_modalities: ['image', 'text'],
      output_modalities: ['text'],
      metadata: {
        description: 'Built on [a model](https://example.com/model).',
        supports_reasoning: true,
        warning_message: 'Preview only.',
      },
    }),
    urls,
  )

  const modelText = JSON.stringify(model)
  expect(modelText).toContain('`image, text` → `text` · `reasoning`')
  expect(modelText).toContain('[a model](https://example.com/model)')
  expect(modelText).toContain('Preview only.')
  expect(modelText.match(/<t:/g)).toHaveLength(1)
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

  const endpoint = renderDiscord(
    lifecycle('endpoint', {
      metadata: {
        context_length: 128_000,
        max_completion_tokens: 4096,
        supported_parameters: ['tools', 'temperature'],
        supports_reasoning: true,
        data_policy: { retainsPrompts: false },
      },
      pricing: {
        discount: 0,
        meters: {
          prompt: '0',
          image: '0.000001',
          audio: '0.000001',
          input_audio_cache: '0.000000000001',
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
  expect(endpointText).toContain('/author.webp')
  expect(endpointText).toContain('/provider.webp')
  expect(endpointText).not.toContain('discount')
  expect(endpointText).not.toContain('supports_reasoning')
  expect(endpointText).toContain('`tools, temperature`')
})

test('prose updates use embeds, preserve warning facts, and reject aggregate overflow', () => {
  const event: EventRow = {
    ...row(
      { metadata: { description: 'Old.', warning_message: null } },
      { metadata: { description: 'New.', warning_message: 'Preview only.' } },
    ),
    entity_kind: 'model',
  }

  const message = renderDiscord(event, urls)
  const text = JSON.stringify(message)

  expect(message?.components).toBeUndefined()
  expect(message?.embeds).toHaveLength(1)
  expect(text).toContain('Before\\n> Old.')
  expect(text).toContain('After\\n> New.')
  expect(text).toContain('Preview only.')
  expect(text).not.toContain('~~')

  expect(render(event)).toMatchObject({
    changes: [
      { path: 'description', before: 'Old.', after: 'New.' },
      { path: 'warning_message', before: null, after: 'Preview only.' },
    ],
  })

  const before = {
    metadata: {
      description: 'A'.repeat(1000),
      warning_message: 'B'.repeat(1000),
      author_display_name: 'C'.repeat(1000),
    },
  }

  const after = {
    metadata: {
      description: 'D'.repeat(1000),
      warning_message: 'E'.repeat(1000),
      author_display_name: 'F'.repeat(1000),
    },
  }

  expect(() => renderDiscord({ ...row(before, after), entity_kind: 'model' }, urls)).toThrow()
})

test('provider discoveries are announced and departures only announce endpoint absence', () => {
  for (const type of ['ADD', 'REMOVE'] as const) {
    const event: EventRow = {
      entity_kind: 'provider',
      entity_id: 'provider',
      type,
      ...(type === 'ADD' ? { previously_known: false } : {}),
      scan_at: '2026-09-30T01:00:00Z',
      context: { provider: context.provider },
      change_json: JSON.stringify({
        type,
        key: 'provider',
        value: { metadata: { headquarters: 'Earth', dataPolicy: { training: true } } },
      }),
    }

    const message = renderDiscord(event, urls)

    if (type === 'ADD') {
      expect(message?.embeds?.[0]?.description).toBe('**Provider** · Provider discovered')
      expect(render(event)).toMatchObject({ type: 'provider_added', previously_known: false })
    } else {
      expect(message?.components).toBeUndefined()
      expect(message?.embeds).toHaveLength(1)
      expect(message?.embeds?.[0]?.footer).toBeUndefined()

      expect(message?.embeds?.[0]).toMatchObject({
        description: '**Provider** has no more listed endpoints.',
        color: 0xef_44_44,
        timestamp: '2026-09-30T01:00:00.000Z',
      })

      expect(message?.embeds?.[0]?.author?.icon_url).toContain('/provider.webp')
      expect(JSON.stringify(message)).not.toContain('Earth')
      expect(JSON.stringify(message)).not.toContain('training')
    }
  }
})

test('unclassified arrivals use neutral wording instead of claiming discovery or return', () => {
  for (const entity_kind of ['model', 'provider', 'endpoint'] as const) {
    const event: EventRow = {
      entity_kind,
      entity_id: 'unclassified',
      type: 'ADD',
      scan_at: '2026-09-30T01:00:00Z',
      context,
      change_json: JSON.stringify({
        key: 'unclassified',
        type: 'ADD',
        value: { metadata: {}, pricing: { meters: {} } },
      }),
    }

    const text = JSON.stringify({ discord: renderDiscord(event, urls), feed: render(event) })

    expect(text.toLowerCase()).not.toContain('discovered')
    expect(text.toLowerCase()).not.toContain('relisted')
    expect(text).not.toContain('again')
    expect(text).not.toContain('✨')
    expect(text).toContain(entity_kind === 'endpoint' ? 'Listed' : 'now has listed endpoints')
  }
})

test('provider updates stay classic and include only legacy metadata and policy URLs', () => {
  const policy = {
    termsOfServiceURL: 'https://example.com/terms',
    privacyPolicyURL: 'https://example.com/privacy',
    training: true,
    retainsPrompts: true,
  }

  const providerRow = (before: unknown, after: unknown): EventRow => ({
    ...row({ metadata: before }, { metadata: after }),
    entity_kind: 'provider',
  })

  // Exercise policy leaf changes and whole-object addition, removal, and null transitions.
  for (const [before, after] of [
    [
      { dataPolicy: { ...policy, training: false, privacyPolicyURL: 'https://old.example' } },
      { dataPolicy: policy },
    ],
    [{}, { dataPolicy: policy }],
    [{ dataPolicy: policy }, {}],
    [{ dataPolicy: null }, { dataPolicy: policy }],
    [{ dataPolicy: policy }, { dataPolicy: null }],
  ]) {
    const event = providerRow(before, after)
    const captured = event.change_json
    const message = renderDiscord(event, urls)
    const text = message?.embeds?.[0]?.description ?? ''

    expect(message?.components).toBeUndefined()
    expect(message?.embeds).toHaveLength(1)
    expect(text).toContain('`privacyPolicyURL`')
    expect(text).not.toContain('training')
    expect(text).not.toContain('retainsPrompts')
    expect(event.change_json).toBe(captured)
    expect(JSON.stringify(render(event))).toContain('training')
  }

  const message = renderDiscord(
    providerRow(
      {
        displayName: 'Old',
        headquarters: 'US',
        datacenters: ['US'],
        statusPageUrl: 'https://old.example',
        byokEnabled: false,
      },
      {
        displayName: 'New',
        headquarters: 'AU',
        datacenters: ['AU'],
        statusPageUrl: `https://example.com/${'a'.repeat(120)}`,
        byokEnabled: true,
      },
    ),
    urls,
  )

  const text = message?.embeds?.[0]?.description ?? ''

  expect(message?.components).toBeUndefined()
  for (const field of ['displayName', 'headquarters', 'datacenters', 'statusPageUrl']) {
    expect(text).toContain(`\`${field}\``)
  }
  expect(text).not.toContain('byokEnabled')

  for (const [before, after] of [
    [
      { byokEnabled: false, hasChatCompletions: false },
      { byokEnabled: true, hasChatCompletions: true },
    ],
    [{ dataPolicy: { training: false } }, { dataPolicy: { training: true } }],
    [{}, { dataPolicy: { training: true } }],
    [{ dataPolicy: { training: true } }, {}],
  ]) {
    expect(renderDiscord(providerRow(before, after), urls)).toBeNull()
  }
})

test('endpoint prose remains an embed and inline code has no bold wrappers', () => {
  const endpoint = renderDiscord(
    row(
      { metadata: { provider_tag: 'old', quantization: 'fp8' } },
      { metadata: { provider_tag: 'tag'.repeat(50), quantization: 'fp16' } },
    ),
    urls,
  )

  expect(endpoint?.components).toBeUndefined()
  expect(endpoint?.embeds).toHaveLength(1)
  expect(endpoint?.embeds?.[0]?.description).toContain('After\n> ')
  expect(endpoint?.embeds?.[0]?.description).not.toContain('**`')
  expect(endpoint?.embeds?.[0]?.footer?.text).toBe('provider/fp8')

  const model = renderDiscord(
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

test('blank scalar and prose values render null without rewriting the captured event', () => {
  for (const blank of ['', '  \n\t']) {
    for (const [before, after] of [
      ['Warning.', blank],
      [blank, 'Warning.'],
    ]) {
      const event: EventRow = {
        ...row({ metadata: { warning_message: before } }, { metadata: { warning_message: after } }),
        entity_kind: 'model',
      }

      const captured = event.change_json
      const description = renderDiscord(event, urls)?.embeds?.[0]?.description

      expect(description).toContain(before === blank ? 'Before\n`null`' : 'After\n`null`')
      expect(event.change_json).toBe(captured)
      expect(render(event)).toMatchObject({ changes: [{ before, after }] })
    }
    expect(fieldValue(blank)).toBe('`null`')
  }
  expect(fieldValue(['tools', 'temperature'])).toBe('`tools, temperature`')
  expect(fieldValue([])).toBe('`[]`')

  expect(
    fieldChange(
      { type: 'field_removed', path: 'description', before: 'Old prose.' },
      { prose: true },
    ),
  ).toBe('~~`description`~~\n> ~~Old prose.~~')

  expect(
    fieldChange({ type: 'field_added', path: 'description', after: 'New prose.' }, { prose: true }),
  ).toBe('`description` · new\n> New prose.')
})

test('endpoint reasoning-only changes are skipped while model reasoning remains visible', () => {
  const event = row(
    { metadata: { supports_reasoning: false } },
    { metadata: { supports_reasoning: true } },
  )

  expect(renderDiscord(event, urls)).toBeNull()

  expect(
    renderDiscord({ ...event, entity_kind: 'model' }, urls)?.embeds?.[0]?.description,
  ).toContain('`supports_reasoning` ~~`false`~~ → `true`')
})

test('one-hour cache writes survive curation and render without pricing units or branding', () => {
  const event = row(
    { pricing: { meters: { input_cache_write_1h: '0.000002' } } },
    { pricing: { meters: { input_cache_write_1h: '0.000004' } } },
  )

  const message = renderDiscord(event, urls)

  expect(message?.embeds?.[0]?.description).toContain('`cache_write_1h` ~~`$2`~~ → `$4` ▲ 100%')
  expect(render(event)).toMatchObject({ changes: [{ path: 'pricing.input_cache_write_1h' }] })

  const lifecycle: EventRow = {
    ...event,
    type: 'ADD',
    change_json: JSON.stringify({
      type: 'ADD',
      key: event.entity_id,
      value: {
        metadata: {},
        pricing: { meters: { input_cache_write_1h: '0.000004', web_search: '0.01' } },
      },
    }),
  }

  const added = renderDiscord(lifecycle, urls)
  expect(added?.embeds?.[0]?.description).toContain('`cache_write_1h` `   $4`')
  expect(added?.embeds?.[0]?.description).toContain('`web_search    ` `$0.01`')
  expect(added?.embeds?.[0]?.description).not.toContain('per ')

  expect(pricingChanges([{ type: 'field_added', path: 'pricing.prompt', after: '1e-6' }])).toEqual([
    '`input` `$1e-6` · new',
  ])

  for (const payload of [message, added]) {
    expect(payload).not.toHaveProperty('username')
    expect(payload).not.toHaveProperty('avatar_url')
    expect(JSON.stringify(payload)).not.toContain('orb-logo')
  }
})

test('web search is a pricing row across updates, additions, and removals without token scaling', () => {
  for (const [before, after, expected] of [
    [
      { web_search: '0.001' },
      { web_search: '0.002' },
      '`web_search` ~~`$0.001`~~ → `$0.002` ▲ 100%',
    ],
    [{}, { web_search: '0.001' }, '`web_search` `$0.001` · new'],
    [{ web_search: '0.001' }, {}, '~~`web_search`~~ ~~`$0.001`~~'],
  ] as const) {
    const event = row({ pricing: { meters: before } }, { pricing: { meters: after } })
    const text = renderDiscord(event, urls)?.embeds?.[0]?.description ?? ''

    expect(text).toContain(expected)
    expect(text).not.toContain('per ')
    expect(render(event)).toMatchObject({ changes: [{ path: 'pricing.web_search' }] })
  }
})

test('cards supply prose and duration rules while generic formatters only follow options', () => {
  const warning = {
    type: 'field_updated',
    path: 'warning_message',
    before: 'Old.',
    after: 'New.',
  } as const

  expect(fieldChange(warning)).toBe('`warning_message` ~~`Old.`~~ → `New.`')

  expect(fieldChange(warning, { prose: true })).toBe(
    '`warning_message`\nBefore\n> Old.\n\nAfter\n> New.',
  )

  const change = {
    type: 'field_updated',
    path: 'data_policy.retentionDays',
    before: 1,
    after: 2,
  } as const

  expect(fieldChange(change)).toBe('`retentionDays` ~~`1`~~ → `2` ▲ 100%')

  const event = row(
    { metadata: { data_policy: { retentionDays: 1 } } },
    { metadata: { data_policy: { retentionDays: 2 } } },
  )

  expect(renderDiscord(event, urls)?.embeds?.[0]?.description).toContain(
    '`retentionDays` ~~`1 days`~~ → `2 days` ▲ 100%',
  )

  for (const after of ['', '  ', null]) {
    expect(
      pricingChanges([
        { type: 'field_updated', path: 'pricing.prompt', before: '0.000001', after },
      ]),
    ).toEqual(['`input` ~~`$1`~~ → `null`'])
  }
})
