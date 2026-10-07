import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from 'bun:test'
import { deepEqual, rejects } from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { convexTest } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'

import { api } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'

const START = Date.UTC(2026, 9, 8, 10)
const workpoolPackage = fileURLToPath(import.meta.resolve('@convex-dev/workpool/package.json'))
const workpoolRoot = path.join(path.dirname(workpoolPackage), 'src/component')

const batchRoot = path.join(
  path.dirname(createRequire(workpoolPackage).resolve('@convex-dev/batch-worker/package.json')),
  'src/component',
)

async function loadSchema(root: string) {
  const loaded: unknown = await import(path.join(root, 'schema.ts'))
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Installed component schemas are loaded dynamically because their bundled test helpers require Vite.
  return (loaded as { default: SchemaDefinition<GenericSchema, boolean> }).default
}
const workpoolSchema = await loadSchema(workpoolRoot)
const batchSchema = await loadSchema(batchRoot)

function modules(root: string) {
  return Object.fromEntries(
    [...new Bun.Glob('**/*.{ts,js}').scanSync({ absolute: true, cwd: root })]
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
      .map((file) => [file, async (): Promise<unknown> => await import(file)]),
  )
}

function setup() {
  const t = convexTest({ modules: modules(import.meta.dir), schema, transactionLimits: true })
  t.registerComponent('workpool', workpoolSchema, modules(workpoolRoot))
  t.registerComponent('workpool/batchWorker', batchSchema, modules(batchRoot))
  return t
}
type Harness = ReturnType<typeof setup>

function mockFetch(handler: (url: URL, init: RequestInit | undefined) => Promise<Response>) {
  const implementation = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const request = new Request(input, init)
      return await handler(new URL(request.url), {
        ...init,
        body: await request.text(),
        headers: request.headers,
        method: request.method,
      })
    },
    { preconnect: fetch.preconnect },
  )
  return spyOn(globalThis, 'fetch').mockImplementation(implementation)
}

async function registerWebhooks(t: Harness, count: number) {
  return await Promise.all(
    Array.from(
      { length: count },
      async (_, index) =>
        await t.mutation(api.api.registerWebhook, {
          name: `recipient-${index}`,
          url: `https://discord.com/api/webhooks/${100_000_000_000_000_000n + BigInt(index)}/test-token-${index}`,
        }),
    ),
  )
}

const messages = [
  { key: 'model-a-overview', payload: JSON.stringify({ content: 'Model A overview' }) },
  { key: 'model-a-pricing', payload: JSON.stringify({ content: 'Model A pricing' }) },
  { key: 'model-b-overview', payload: JSON.stringify({ content: 'Model B overview' }) },
]

async function submit(t: Harness, webhookIds: Id<'webhooks'>[], expiresAt = START + 3_600_000) {
  return await t.mutation(api.api.submitBatch, {
    expiresAt,
    key: 'ingestion-1',
    messages,
    webhookIds,
  })
}

async function finishedAt(t: Harness, inputId: Id<'inputs'>) {
  const input = await t.query(api.api.getInput, { inputId })
  return input?.finishedAt
}

async function drain(t: Harness) {
  // Small steps let pending jobs start without jumping to Workpool's recovery timers.
  for (let tick = 0; tick < 1000; tick += 1) {
    await t.finishAllScheduledFunctions(() => {
      jest.advanceTimersByTime(10)
    })

    const unfinished = await t.run(async (ctx) => {
      const inputs = await ctx.db.query('inputs').collect()
      return inputs.some((input) => input.finishedAt === undefined)
    })

    if (!unfinished) {
      await t.finishAllScheduledFunctions(() => {
        jest.runAllTimers()
      })
      return
    }
  }
  throw new Error('Workpool did not finish the submitted inputs')
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(START)
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('Workpool delivery', () => {
  test('claims before HTTP, sends each recipient the ordered messages, and retains immutable receipts', async () => {
    const t = setup()
    const webhookIds = await registerWebhooks(t, 2)
    const inputId = await submit(t, webhookIds)
    const claimsBeforeHttp = new Map<string, Doc<'deliveries'>>()
    const bodiesByWebhook = new Map<string, string[]>()

    const fetcher = mockFetch(async (url, init) => {
      const index = Number(url.pathname.split('/').at(-1)?.replace('test-token-', ''))
      const webhookId = webhookIds[index]

      if (webhookId === undefined || typeof init?.body !== 'string') {
        throw new Error('Unexpected webhook request')
      }

      const bodies = bodiesByWebhook.get(webhookId) ?? []
      const history = await t.query(api.api.listDeliveries, { inputId, webhookId })
      const claim = history.at(-1)
      expect(claim).toMatchObject({ event: { kind: 'claimed' }, messageIndex: bodies.length })

      if (claim === undefined) {
        throw new Error('Expected claim before sending')
      }

      claimsBeforeHttp.set(claim._id, claim)
      expect(init.method).toBe('POST')
      expect(url.searchParams.get('wait')).toBe('true')
      expect(await finishedAt(t, inputId)).toBeUndefined()
      bodies.push(init.body)
      bodiesByWebhook.set(webhookId, bodies)
      return Response.json(
        {
          channel_id: `channel-${index}`,
          content: 'saved',
          id: `message-${index}-${bodies.length}`,
        },
        { headers: { 'x-ratelimit-remaining': '4' } },
      )
    })

    await drain(t)

    expect(fetcher).toHaveBeenCalledTimes(6)

    expect([...bodiesByWebhook.values()]).toEqual([
      messages.map(({ payload }) => payload),
      messages.map(({ payload }) => payload),
    ])

    const input = await t.query(api.api.getInput, { inputId })
    expect(input).toMatchObject({ messages, webhookIds })
    expect(input?.finishedAt).toBeDefined()
    const history = await t.query(api.api.listDeliveries, { inputId })
    expect(history).toHaveLength(12)
    for (const row of history) {
      expect(row).not.toHaveProperty('payload')
      expect(row).not.toHaveProperty('messages')
      expect(row._creationTime).toBeGreaterThanOrEqual(START)

      if (row.event.kind === 'claimed') {
        deepEqual(row, claimsBeforeHttp.get(row._id))
      } else {
        expect(row.claimId).toBeDefined()
        expect(claimsBeforeHttp.has(row.claimId ?? '')).toBe(true)
        const recipientIndex = webhookIds.indexOf(row.webhookId)

        expect(row.event).toMatchObject({
          kind: 'succeeded',
          response: {
            body: JSON.stringify({
              channel_id: `channel-${recipientIndex}`,
              content: 'saved',
              id: `message-${recipientIndex}-${row.messageIndex + 1}`,
            }),
            channelId: `channel-${recipientIndex}`,
            headers: { 'x-ratelimit-remaining': '4' },
            messageId: `message-${recipientIndex}-${row.messageIndex + 1}`,
            status: 200,
          },
        })
      }
    }
    const inputs = await t.run(async (ctx) => await ctx.db.query('inputs').collect())
    expect(inputs).toHaveLength(1)
  })

  test('ten assigned webhook jobs share five slots and finish the input only after the last recipient', async () => {
    const t = setup()
    const webhookIds = await registerWebhooks(t, 10)
    const inputId = await submit(t, webhookIds)
    const firstFiveStarted = Promise.withResolvers<null>()
    const replacementStarted = Promise.withResolvers<null>()
    const gates: Array<ReturnType<typeof Promise.withResolvers<null>>> = []
    let holding = true
    let active = 0
    let maximumActive = 0
    let requests = 0
    const startedWebhooks = new Set<string>()

    mockFetch(async (url) => {
      requests += 1
      const requestNumber = requests
      active += 1
      maximumActive = Math.max(maximumActive, active)
      startedWebhooks.add(url.pathname)

      if (holding) {
        const gate = Promise.withResolvers<null>()
        gates.push(gate)

        if (gates.length === 5) {
          firstFiveStarted.resolve(null)
        }

        if (startedWebhooks.size === 6) {
          replacementStarted.resolve(null)
        }

        await gate.promise
      }

      active -= 1
      return Response.json({ channel_id: 'channel', id: `message-${requestNumber}` })
    })

    const allScheduled = drain(t)
    try {
      await firstFiveStarted.promise
      expect(active).toBe(5)
      expect(startedWebhooks.size).toBe(5)
      const firstClaims = await t.query(api.api.listDeliveries, { inputId })
      expect(firstClaims).toHaveLength(5)
      expect(firstClaims.every(({ event }) => event.kind === 'claimed')).toBe(true)
      expect(await finishedAt(t, inputId)).toBeUndefined()

      // Complete one assigned job's three HTTP calls while the other four remain blocked.
      gates[0]?.resolve(null)
      for (let nextGate = 5; nextGate < 7; nextGate += 1) {
        while (gates.length <= nextGate) {
          await setImmediate()
        }
        gates[nextGate]?.resolve(null)
      }
      await replacementStarted.promise
      expect(active).toBe(5)
      expect(startedWebhooks.size).toBe(6)
      expect(await finishedAt(t, inputId)).toBeUndefined()
    } finally {
      holding = false
      for (const gate of gates) {
        gate.resolve(null)
      }
      await allScheduled
    }

    expect(maximumActive).toBe(5)
    expect(requests).toBe(30)
    expect(startedWebhooks.size).toBe(10)
    expect(await finishedAt(t, inputId)).toBeDefined()
  })

  test('zero recipients completes without a delivery or HTTP request', async () => {
    const t = setup()

    const fetcher = mockFetch(async () => {
      throw new Error('No recipient should be called')
    })

    const inputId = await submit(t, [])
    await drain(t)
    expect(await finishedAt(t, inputId)).toBeDefined()
    expect(await t.query(api.api.listDeliveries, { inputId })).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('an already expired input records terminal outcomes without HTTP', async () => {
    const t = setup()
    const webhookIds = await registerWebhooks(t, 2)

    const fetcher = mockFetch(async () => {
      throw new Error('Expired payload must not be sent')
    })

    const inputId = await submit(t, webhookIds, START - 1)
    await drain(t)
    const history = await t.query(api.api.listDeliveries, { inputId })
    expect(history).toHaveLength(2)
    expect(history.every(({ event }) => event.kind === 'expired')).toBe(true)
    expect(await finishedAt(t, inputId)).toBeDefined()
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('expiry after a confirmed message preserves its receipt and stops the remaining suffix', async () => {
    const t = setup()
    const webhookIds = await registerWebhooks(t, 1)
    const inputId = await submit(t, webhookIds, START + 60_000)

    const fetcher = mockFetch(async () => {
      jest.setSystemTime(START + 120_000)
      return Response.json({ channel_id: 'channel', id: 'delivered-before-expiry' })
    })

    await drain(t)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const history = await t.query(api.api.listDeliveries, { inputId })

    expect(history.map(({ messageIndex, event }) => [messageIndex, event.kind])).toEqual([
      [0, 'claimed'],
      [0, 'succeeded'],
      [1, 'expired'],
    ])

    expect(await finishedAt(t, inputId)).toBeDefined()
  })

  test('a rejected message stops that recipient while other recipients finish', async () => {
    const t = setup()
    const webhookIds = await registerWebhooks(t, 2)
    const inputId = await submit(t, webhookIds)
    const calls = new Map<string, number>()

    mockFetch(async (url) => {
      calls.set(url.pathname, (calls.get(url.pathname) ?? 0) + 1)
      return url.pathname.endsWith('test-token-0')
        ? Response.json({ code: 50_006, message: 'Cannot send an empty message' }, { status: 400 })
        : Response.json({ channel_id: 'channel', id: 'confirmed' })
    })

    await drain(t)
    expect([...calls.values()].toSorted((a, b) => a - b)).toEqual([1, 3])
    const history = await t.query(api.api.listDeliveries, { inputId })
    const failures = history.filter(({ event }) => event.kind === 'failed')
    expect(failures).toHaveLength(1)

    expect(failures[0]).toMatchObject({
      event: {
        kind: 'failed',
        response: {
          body: JSON.stringify({ code: 50_006, message: 'Cannot send an empty message' }),
          status: 400,
        },
      },
      messageIndex: 0,
      webhookId: webhookIds[0],
    })

    expect(history.filter(({ event }) => event.kind === 'succeeded')).toHaveLength(3)
    expect(await finishedAt(t, inputId)).toBeDefined()
  })

  test('a repeated submission reuses its input and does not enqueue another delivery', async () => {
    const t = setup()
    const webhookIds = await registerWebhooks(t, 1)
    const inputId = await submit(t, webhookIds)
    expect(await submit(t, webhookIds)).toBe(inputId)
    const fetcher = mockFetch(async () => Response.json({ channel_id: 'channel', id: 'confirmed' }))
    await drain(t)
    expect(await submit(t, webhookIds)).toBe(inputId)
    await drain(t)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(await t.query(api.api.listDeliveries, { inputId })).toHaveLength(6)

    await rejects(
      t.mutation(api.api.submitBatch, {
        expiresAt: START + 3_600_000,
        key: 'ingestion-1',
        messages: [{ key: 'changed', payload: '{"content":"changed"}' }],
        webhookIds,
      }),
    )
  })

  test('Workpool reports an unexpected action failure through its completion callback', async () => {
    const t = setup()
    const webhookIds = await registerWebhooks(t, 2)
    const inputId = await submit(t, webhookIds)
    const [brokenWebhookId] = webhookIds

    if (brokenWebhookId === undefined) {
      throw new Error('Expected a webhook to corrupt in the fixture')
    }
    // Invalid historical data makes URL construction throw before transport handles HTTP errors.
    await t.run(async (ctx) => {
      await ctx.db.patch(brokenWebhookId, { url: 'not a URL' })
    })

    const fetcher = mockFetch(async () => Response.json({ channel_id: 'channel', id: 'confirmed' }))

    await drain(t)

    expect(fetcher).toHaveBeenCalledTimes(3)

    const failedHistory = await t.query(api.api.listDeliveries, {
      inputId,
      webhookId: brokenWebhookId,
    })

    expect(failedHistory.map(({ event }) => event.kind)).toEqual(['claimed', 'failed'])
    const [claim, failure] = failedHistory

    expect(failure).toMatchObject({
      claimId: claim?._id,
      event: { kind: 'failed' },
      messageIndex: 0,
    })

    if (failure?.event.kind !== 'failed') {
      throw new Error('Expected the Workpool failure callback to record the error')
    }

    expect(failure.event.error).toContain('URL')
    expect(failure.event).not.toHaveProperty('response')
    expect(await finishedAt(t, inputId)).toBeDefined()
  })
})

describe('submission boundaries', () => {
  test('invalid batches leave no input, delivery, or scheduled HTTP side effect', async () => {
    const t = setup()
    const webhookIds = await registerWebhooks(t, 1)
    const [webhookId] = webhookIds

    if (webhookId === undefined) {
      throw new Error('Expected a registered webhook')
    }

    const valid = { expiresAt: START + 3_600_000, key: 'invalid-batch', messages, webhookIds }

    const invalidInputs = [
      { ...valid, key: '' },
      { ...valid, messages: [] },
      { ...valid, webhookIds: [webhookId, webhookId] },
      { ...valid, messages: [{ key: '', payload: '{}' }] },
      {
        ...valid,
        messages: [
          { key: 'duplicate', payload: '{}' },
          { key: 'duplicate', payload: '{}' },
        ],
      },
      { ...valid, messages: [{ key: 'bad-json', payload: '{"content":' }] },
      { ...valid, messages: [{ key: 'array', payload: '[]' }] },
      { ...valid, messages: [{ key: 'null', payload: 'null' }] },
      { ...valid, messages: [{ key: 'scalar', payload: '42' }] },
      { ...valid, expiresAt: -1 },
      { ...valid, expiresAt: Number.NaN },
      { ...valid, expiresAt: Number.POSITIVE_INFINITY },
    ]

    const fetcher = mockFetch(async () => {
      throw new Error('A rejected submission must not make HTTP requests')
    })

    for (const input of invalidInputs) {
      await rejects(t.mutation(api.api.submitBatch, input))
    }
    await drain(t)

    const rows = await t.run(async (ctx) => ({
      deliveries: await ctx.db.query('deliveries').collect(),
      inputs: await ctx.db.query('inputs').collect(),
    }))

    expect(rows).toEqual({ deliveries: [], inputs: [] })
    expect(fetcher).not.toHaveBeenCalled()
  })

  test('webhook registration normalizes HTTP URLs while preserving custom hosts and routing parameters', async () => {
    const t = setup()

    const httpsId = await t.mutation(api.api.registerWebhook, {
      name: 'custom receiver',
      url: 'HTTPS://Receiver.Example:443/webhooks/test?thread_id=123&wait=false',
    })

    const sameId = await t.mutation(api.api.registerWebhook, {
      url: 'https://receiver.example/webhooks/test?thread_id=123&wait=false',
    })

    const httpId = await t.mutation(api.api.registerWebhook, {
      url: 'http://Receiver.Example:80/webhooks/test?thread_id=456',
    })

    expect(sameId).toBe(httpsId)

    for (const url of [
      'https://user:password@receiver.example/webhooks/test',
      'https://receiver.example/webhooks/test#fragment',
      'ftp://receiver.example/webhooks/test',
      'not a URL',
    ]) {
      await rejects(t.mutation(api.api.registerWebhook, { url }))
    }

    const webhooks = await t.run(async (ctx) => await ctx.db.query('webhooks').collect())
    expect(webhooks).toHaveLength(2)

    expect(webhooks.find(({ _id }) => _id === httpsId)).toMatchObject({
      name: 'custom receiver',
      url: 'https://receiver.example/webhooks/test?thread_id=123&wait=false',
    })

    expect(webhooks.find(({ _id }) => _id === httpId)).toMatchObject({
      url: 'http://receiver.example/webhooks/test?thread_id=456',
    })
  })

  test('payload bytes survive validation and sending, and every immutable input field participates in dedupe', async () => {
    const t = setup()
    const webhookIds = await registerWebhooks(t, 2)

    const firstPayload =
      '  { "content" : "\\u0068ello \\u2603", "allowed_mentions" : { "parse" : [] } }\n'

    const original = {
      expiresAt: START + 3_600_000,
      key: 'byte-preserving-batch',
      messages: [
        { key: 'overview', payload: firstPayload },
        { key: 'pricing', payload: '{ "content": "Pricing", "embeds": [] }' },
      ],
      webhookIds,
    }

    const inputId = await t.mutation(api.api.submitBatch, original)
    expect(await t.mutation(api.api.submitBatch, original)).toBe(inputId)

    const conflictingInputs = [
      { ...original, webhookIds: webhookIds.toReversed() },
      { ...original, messages: original.messages.toReversed() },
      { ...original, expiresAt: original.expiresAt + 1 },
      {
        ...original,
        messages: original.messages.map((message) =>
          message.key === 'overview'
            ? { ...message, payload: '{"content":"hello ☃","allowed_mentions":{"parse":[]}}' }
            : message,
        ),
      },
      {
        ...original,
        messages: original.messages.map((message) => ({
          ...message,
          key: `renamed-${message.key}`,
        })),
      },
    ]
    for (const input of conflictingInputs) {
      await rejects(t.mutation(api.api.submitBatch, input))
    }
    const sentBodies: string[] = []

    mockFetch(async (_url, init) => {
      if (typeof init?.body !== 'string') {
        throw new TypeError('Expected the submitted serialized payload')
      }

      sentBodies.push(init.body)
      return Response.json({ channel_id: 'channel', id: 'confirmed' })
    })

    await drain(t)

    const stored = await t.query(api.api.getInput, { inputId })
    expect(stored).toMatchObject(original)
    expect(sentBodies).toHaveLength(4)
    for (const { payload } of original.messages) {
      expect(sentBodies.filter((body) => body === payload)).toHaveLength(2)
    }
    const inputs = await t.run(async (ctx) => await ctx.db.query('inputs').collect())
    expect(inputs).toHaveLength(1)
    expect(await t.query(api.api.listDeliveries, { inputId })).toHaveLength(8)
  })
})
