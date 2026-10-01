import { expect, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import { ComponentType } from 'discord-api-types/v10'

import type { ActionCtx } from '../_generated/server'
import { broadcast, send, sendExamples, sendLatest } from './discord'
import { compare } from './events/compare'
import type { EventRow } from './events/query'

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
      content: '-# pre-alpha • event: test-event',
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
        { type: ComponentType.TextDisplay, content: '-# pre-alpha • event: component-event' },
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
    expect(pause.mock.calls.map((call) => call[1])).toEqual(Array.from({ length: 2 }, () => 2000))

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
    ORCA_DISCORD_PREVIEW_ENABLED: 'false',
    ORCA_PUBLIC_URL: urls.publicUrl,
    ENTITY_LOGO_SERVICE_ORIGIN: urls.logoOrigin,
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

        return typeof body === 'string' ? /event-\d+/.exec(body)?.[0] : undefined
      }),
    ).toEqual(Array.from({ length: 10 }, (_, index) => `event-${110 - index}`))
    expect(process.env.ORCA_DISCORD_PREVIEW_ENABLED).toBe('false')

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
