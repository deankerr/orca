import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import { ComponentType } from 'discord-api-types/v10'

import type { ActionCtx } from '../../_generated/server'
import { normalizeModel, normalizeEndpoint } from '../../entities'
import { compare } from '../../events/compare'
import type { EventRow } from '../../events/table'
import type { JsonValue } from '../../json'
import { broadcast, send, sendExamples, sendLatest } from './delivery'

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

test('manual delivery posts once, surfaces rejection, and refuses an unset webhook', async () => {
  type Handler = (ctx: ActionCtx, args: { event_id: string }) => Promise<string>

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise the registered action with only its runQuery dependency mocked.
  const handler = (send as unknown as { _handler: Handler })._handler

  let current = row({ metadata: { is_disabled: false } }, { metadata: { is_disabled: true } })

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This action only reads one captured event through runQuery.
  const ctx = { runQuery: async () => current } as unknown as ActionCtx

  const settings = {
    ORCA_DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/test/token?thread_id=123',
    ORCA_WEB_ORIGIN: urls.publicUrl,
    ORCA_LOGO_ORIGIN: urls.logoOrigin,
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
    })

    expect(payload).not.toHaveProperty('content')
    expect(body).not.toContain('test-event')
    expect(body).not.toContain('pre-alpha')
    expect(payload).not.toHaveProperty('username')
    expect(payload).not.toHaveProperty('avatar_url')

    current = {
      ...current,
      type: 'ADD',
      change_json: JSON.stringify({
        type: 'ADD',
        key: current.entity_id,
        value: normalizeEndpoint({
          id: current.entity_id,
          model_id: context.model.model_id,
          model_variant_slug: context.model.model_id,
          provider_id: context.provider.provider_id,
          provider_tag: context.endpoint.provider_tag,
          provider_display_name: context.endpoint.provider_display_name,
          variant: 'standard',
          pricing: { discount: 0 },
        }),
      }),
    }

    expect(await handler(ctx, { event_id: 'test-event' })).toBe('sent')
    const richTarget = request.mock.calls[1]?.[0]
    expect(richTarget instanceof URL && richTarget.searchParams.has('with_components')).toBe(false)

    // Model discoveries use Components V2 with only the introductory card.
    const modelEvent: EventRow = {
      ...current,
      entity_kind: 'model',
      context: { model: context.model },
      previously_known: false,
      change_json: JSON.stringify({
        key: current.entity_id,
        type: 'ADD',
        value: normalizeModel({
          id: current.entity_id,
          slug: 'author/model',
          permaslug: 'author/model',
          variant: 'standard',
          short_name: 'Model',
          created_at: current.scan_at,
          input_modalities: ['text'],
          output_modalities: ['text'],
        }),
      }),
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Component delivery uses the same single-query action dependency.
    const componentCtx = { runQuery: async () => modelEvent } as unknown as ActionCtx
    await handler(componentCtx, { event_id: 'component-event' })
    const componentBody = request.mock.calls[2]?.[1]?.body

    const componentPayload: unknown =
      typeof componentBody === 'string' ? JSON.parse(componentBody) : null

    expect(componentPayload).not.toHaveProperty('content')

    expect(componentPayload).toMatchObject({
      components: [{ type: ComponentType.Container }],
    })

    expect(componentPayload).toHaveProperty('components.length', 1)
    expect(componentBody).not.toContain('component-event')
    expect(componentBody).not.toContain('pre-alpha')
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

test('gallery sends selected events sequentially with two-second gaps and stops on rejection', async () => {
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
  let grouped = false

  const queryContext = {
    runQuery: async (_query: unknown, args: { event_id: string }) => {
      events.push(args.event_id)
      order.push('read')
      return row(
        { metadata: { is_disabled: false, max_completion_tokens: 100 } },
        {
          metadata: {
            is_disabled: true,
            max_completion_tokens: grouped && args.event_id === 'first' ? 200 : 100,
          },
        },
        grouped ? args.event_id : undefined,
      )
    },
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Sending only reads the captured event through runQuery.
  const ctx = queryContext as unknown as ActionCtx

  const settings = {
    ORCA_DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/test/token',
    ORCA_DISCORD_AUTO_SEND_ENABLED: 'false',
    ORCA_WEB_ORIGIN: urls.publicUrl,
    ORCA_LOGO_ORIGIN: urls.logoOrigin,
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

    delete process.env.ORCA_DISCORD_AUTO_SEND_ENABLED
    expect(await liveHandler(ctx, args)).toEqual({ sent: 0, skipped: 0 })
    expect(events).toEqual([])
    expect(request).not.toHaveBeenCalled()

    process.env.ORCA_DISCORD_AUTO_SEND_ENABLED = 'true'
    expect(await liveHandler(ctx, args)).toEqual({ sent: 3, skipped: 0 })
    expect(events).toEqual(args.event_ids)
    expect(pause.mock.calls.map((call) => call[1])).toEqual(Array.from({ length: 2 }, () => 2000))

    expect(order).toEqual(['read', 'read', 'read', 'pause', 'pause'])

    grouped = true
    expect(await liveHandler(ctx, { event_ids: [...args.event_ids, 'fourth', 'fifth'] })).toEqual({
      sent: 2,
      skipped: 0,
    })
    const batchBody = request.mock.calls[3]?.[1]?.body
    const remainderBody = request.mock.calls[4]?.[1]?.body
    expect(batchBody).toContain('5 endpoints updated')
    expect(batchBody).not.toContain('pre-alpha')
    const batchPayload: unknown = typeof batchBody === 'string' ? JSON.parse(batchBody) : null
    expect(batchPayload).not.toHaveProperty('content')
    expect(remainderBody).toContain('max_output')
    expect(remainderBody).not.toContain('is_disabled')

    request.mockResolvedValue(new Response('rate limited', { status: 429 }))
    await rejects(handler(ctx, args), /Discord webhook rejected/)
    expect(request).toHaveBeenCalledTimes(6)
    expect(pause).toHaveBeenCalledTimes(3)
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

test('latest replay fills its default count across filtered pages, respects limits, and bounds scanning', async () => {
  type Handler = (
    ctx: ActionCtx,
    args: { limit?: number },
  ) => Promise<{ sent: number; skipped: number }>

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Test the registered action through its query and transport dependencies.
  const handler = (sendLatest as unknown as { _handler: Handler })._handler
  const visible = row({ metadata: { is_disabled: false } }, { metadata: { is_disabled: true } })
  const hidden = row(
    { pricing: { meters: { prompt: '1' } } },
    { pricing: { meters: { prompt: '1.001' } } },
  )

  let events = Array.from({ length: 112 }, (_, index) => ({
    ...(index < 101 ? hidden : visible),
    _id: `event-${index}`,
    scan_at: new Date(Date.UTC(2026, 8, 30, 0, index)).toISOString(),
  }))
  let pages = 0

  const queryContext = {
    runQuery: async (
      _query: unknown,
      args: { event_id?: string; paginationOpts?: { cursor: string | null; numItems: number } },
    ) => {
      if (args.event_id !== undefined) {
        return events.find((event) => event._id === args.event_id) ?? null
      }

      pages += 1
      const start = Number(args.paginationOpts?.cursor ?? 0)
      const end = start + (args.paginationOpts?.numItems ?? 100)

      return {
        page: events.slice(start, end),
        isDone: end >= events.length,
        continueCursor: String(end),
      }
    },
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Only paginated history and individual event reads are used by the action.
  const ctx = queryContext as unknown as ActionCtx
  const settings = {
    ORCA_DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/test/token',
    ORCA_DISCORD_AUTO_SEND_ENABLED: 'false',
    ORCA_WEB_ORIGIN: urls.publicUrl,
    ORCA_LOGO_ORIGIN: urls.logoOrigin,
  }
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]))
  const originalTimeout = globalThis.setTimeout
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Accelerate fixed batch pacing without changing timer semantics.
  const immediateTimeout = (callback: () => void) => originalTimeout(callback, 0)
  const pause = spyOn(globalThis, 'setTimeout').mockImplementation(
    Object.assign(immediateTimeout, originalTimeout),
  )
  const request = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))

  try {
    Object.assign(process.env, settings)
    expect(await handler(ctx, {})).toEqual({ sent: 10, skipped: 101 })
    expect(pages).toBe(2)
    expect(
      request.mock.calls.map((call) => {
        const body = call[1]?.body

        return typeof body === 'string' ? /2026-09-30T[\d:.]+Z/.exec(body)?.[0] : undefined
      }),
    ).toEqual(
      events
        .slice(101, 111)
        .toReversed()
        .map((event) => event.scan_at),
    )
    expect(process.env.ORCA_DISCORD_AUTO_SEND_ENABLED).toBe('false')

    expect(await handler(ctx, { limit: 2 })).toEqual({ sent: 2, skipped: 101 })
    events = events.slice(101, 104)
    expect(await handler(ctx, { limit: 10 })).toEqual({ sent: 3, skipped: 0 })

    events = Array.from({ length: 600 }, (_, index) => ({ ...hidden, _id: `hidden-${index}` }))
    pages = 0
    expect(await handler(ctx, {})).toEqual({ sent: 0, skipped: 500 })
    expect(pages).toBe(5)
    expect(request).toHaveBeenCalledTimes(15)

    for (const limit of [0, -1, 1.5, 51, Number.NaN, Number.POSITIVE_INFINITY]) {
      await rejects(handler(ctx, { limit }), /integer between 1 and 50/)
    }
    expect(pages).toBe(5)
    expect(request).toHaveBeenCalledTimes(15)
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

function row(
  before: JsonValue,
  after: JsonValue,
  entity_id = 'abcdef-123',
): Extract<EventRow, { entity_kind: 'endpoint' }> {
  const [change] = compare({ [entity_id]: before }, { [entity_id]: after })

  if (change === undefined) {
    throw new Error('Expected an event')
  }

  return {
    entity_kind: 'endpoint',
    entity_id,
    type: 'UPDATE',
    scan_at: '2026-09-30T01:00:00Z',
    context,
    change_json: JSON.stringify(change),
  }
}
