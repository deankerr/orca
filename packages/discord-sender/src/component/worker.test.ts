import { afterEach, beforeEach, expect, jest, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { convexTest } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'
import { z } from 'zod'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const START = Date.UTC(2026, 9, 9)
const workpoolPackage = fileURLToPath(import.meta.resolve('@convex-dev/workpool/package.json'))
const workpoolRoot = path.join(path.dirname(workpoolPackage), 'src/component')
const batchRoot = path.join(
  path.dirname(createRequire(workpoolPackage).resolve('@convex-dev/batch-worker/package.json')),
  'src/component',
)

function modules(root: string) {
  return Object.fromEntries(
    [...new Bun.Glob('**/*.ts').scanSync({ absolute: true, cwd: root })]
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
      .map((file) => [file, async (): Promise<unknown> => await import(file)]),
  )
}

async function loadSchema(root: string) {
  const loaded: unknown = await import(path.join(root, 'schema.ts'))
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Installed component test helpers require Vite; Bun loads their actual schemas directly.
  return (loaded as { default: SchemaDefinition<GenericSchema, boolean> }).default
}

const workpoolSchema = await loadSchema(workpoolRoot)
const batchSchema = await loadSchema(batchRoot)

function setup() {
  const t = convexTest({ modules: modules(import.meta.dir), schema, transactionLimits: true })
  t.registerComponent('workpool', workpoolSchema, modules(workpoolRoot))
  t.registerComponent('workpool/batchWorker', batchSchema, modules(batchRoot))
  return t
}
type Harness = ReturnType<typeof setup>

async function webhook(t: Harness, index = 1) {
  return await t.mutation(api.api.registerWebhook, {
    topics: ['alerts'],
    url: `https://discord.com/api/v10/webhooks/10000000000000000${index}/test-token`,
  })
}

// Seed accepted jobs without also scheduling a drain. Each test controls whether
// to invoke the real action directly or exercise recovery through Workpool.
async function job(t: Harness, webhookId: Id<'webhooks'>, key: string, expiresAt = START + 60_000) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert('jobs', {
        expiresAt,
        key,
        messages: [0, 1].map((index) => ({
          key: `${key}:${index}`,
          kind: 'send' as const,
          payload: JSON.stringify({ content: `${key}:${index}` }),
        })),
        webhookId,
      }),
  )
}

function receipt() {
  return Response.json({ channel_id: '100000000000000098', id: '100000000000000099' })
}

function requests(handler: (content: string) => Promise<Response>) {
  const sent: string[] = []
  spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const request = new Request(input, init)
        const { content } = z.object({ content: z.string() }).parse(await request.json())
        sent.push(content)
        return await handler(content)
      },
      { preconnect: fetch.preconnect },
    ),
  )
  return sent
}

async function results(t: Harness, jobId: Id<'jobs'>) {
  return await t.query(api.api.listResults, { jobId })
}

async function outcome(t: Harness, jobId: Id<'jobs'>) {
  const stored = await t.query(api.api.getJob, { jobId })
  return stored?.outcome
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

test('jobs and messages stay ordered per webhook while another webhook progresses independently', async () => {
  const t = setup()
  const firstWebhook = await webhook(t)
  const first = await job(t, firstWebhook, 'first')
  const next = await job(t, firstWebhook, 'next')
  const other = await job(t, await webhook(t, 2), 'other')
  const otherSent = Promise.withResolvers<null>()
  const release = Promise.withResolvers<Response>()
  const sent = requests(async (content) => {
    if (content === 'first:0') {
      return await release.promise
    }
    if (content === 'first:1') {
      const committed = await results(t, first)
      expect(committed.map((result) => result.messageKey)).toEqual(['first:0'])
    }
    if (content === 'other:1') {
      otherSent.resolve(null)
    }
    return receipt()
  })
  const drain = t.action(internal.worker.drain, {})

  try {
    await otherSent.promise
    expect(sent.filter((content) => !content.startsWith('other'))).toEqual(['first:0'])
  } finally {
    release.resolve(receipt())
    await drain
  }

  expect(sent.filter((content) => !content.startsWith('other'))).toEqual([
    'first:0',
    'first:1',
    'next:0',
    'next:1',
  ])
  expect(sent.filter((content) => content.startsWith('other'))).toEqual(['other:0', 'other:1'])
  for (const jobId of [first, next, other]) {
    expect(await outcome(t, jobId)).toBe('succeeded')
    expect(await results(t, jobId)).toHaveLength(2)
  }
})

test('transient HTTP failure retries without recording duplicate terminal receipts', async () => {
  const t = setup()
  const jobId = await job(t, await webhook(t), 'retry')
  let unavailable = true
  const sent = requests(async () => {
    if (unavailable) {
      unavailable = false
      return new Response('Unavailable', { status: 503 })
    }
    return receipt()
  })

  await t.action(internal.worker.drain, {})

  expect(sent).toEqual(['retry:0', 'retry:0', 'retry:1'])
  expect(await outcome(t, jobId)).toBe('succeeded')
  const stored = await results(t, jobId)
  expect(stored.map((result) => result.messageKey)).toEqual(['retry:0', 'retry:1'])
  expect(stored.every((result) => result.result.kind === 'succeeded')).toBe(true)
})

test('exhausted outage leaves a resumable prefix and public recovery runs through Workpool', async () => {
  const t = setup()
  const failed = await job(t, await webhook(t), 'outage')
  const independent = await job(t, await webhook(t, 2), 'independent')
  let unavailable = true
  const sent = requests(async (content) =>
    content === 'outage:1' && unavailable
      ? new Response('Unavailable', { status: 503 })
      : receipt(),
  )

  await rejects(t.action(internal.worker.drain, {}))

  expect(await outcome(t, failed)).toBeUndefined()
  const prefix = await results(t, failed)
  expect(prefix.map((result) => result.messageKey)).toEqual(['outage:0'])
  expect(await outcome(t, independent)).toBe('succeeded')
  sent.length = 0
  unavailable = false
  await t.mutation(api.api.resume, {})
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(10)
  })

  expect(sent).toEqual(['outage:1'])
  expect(await outcome(t, failed)).toBe('succeeded')
  const recovered = await results(t, failed)
  expect(recovered.map((result) => result.messageKey)).toEqual(['outage:0', 'outage:1'])
})

test('cancelling an in-flight send retains its receipt without reopening the job or sending its suffix', async () => {
  const t = setup()
  const jobId = await job(t, await webhook(t), 'cancel')
  const started = Promise.withResolvers<null>()
  const release = Promise.withResolvers<Response>()
  const sent = requests(async () => {
    started.resolve(null)
    return await release.promise
  })
  const drain = t.action(internal.worker.drain, {})
  await started.promise
  await t.mutation(api.api.cancelJob, { jobId })
  const terminal = await t.query(api.api.getJob, { jobId })
  release.resolve(receipt())
  await drain

  expect(sent).toEqual(['cancel:0'])
  expect(await outcome(t, jobId)).toBe('cancelled')
  expect(await t.query(api.api.getJob, { jobId })).toEqual(terminal)
  const stored = await results(t, jobId)
  expect(stored).toHaveLength(1)
  expect(stored[0]?.result).toMatchObject({
    kind: 'succeeded',
    response: { id: '100000000000000099' },
  })
})

test('expiry after a request begins retains its receipt but prevents further HTTP', async () => {
  const t = setup()
  const destination = await webhook(t)
  const active = await job(t, destination, 'active', START + 100)
  const expired = await job(t, destination, 'expired', START - 1)
  const sent = requests(async () => {
    jest.setSystemTime(START + 101)
    return receipt()
  })

  await t.action(internal.worker.drain, {})

  expect(sent).toEqual(['active:0'])
  expect(await outcome(t, active)).toBe('expired')
  expect(await results(t, active)).toHaveLength(1)
  expect(await outcome(t, expired)).toBe('expired')
  expect(await results(t, expired)).toEqual([])
})

test('expiry between SDK attempts prevents retrying HTTP and leaves no transient receipt', async () => {
  const t = setup()
  const jobId = await job(t, await webhook(t), 'retry-expiry', START + 100)
  const sent = requests(async () => {
    jest.setSystemTime(START + 101)
    return new Response('Unavailable', { status: 503 })
  })

  await t.action(internal.worker.drain, {})

  expect(sent).toEqual(['retry-expiry:0'])
  expect(await outcome(t, jobId)).toBe('expired')
  expect(await results(t, jobId)).toEqual([])
})

for (const invalidCredentials of [false, true]) {
  test(
    invalidCredentials
      ? 'invalid credentials stop the suffix and gate the next job'
      : 'a rejected payload stops its suffix but allows the next job',
    async () => {
      const t = setup()
      const destination = await webhook(t)
      const rejected = await job(t, destination, 'rejected')
      const next = await job(t, destination, 'next')
      const code = invalidCredentials ? 10_015 : 50_035
      const sent = requests(async (content) =>
        content === 'rejected:0'
          ? Response.json({ code, message: 'Rejected' }, { status: invalidCredentials ? 404 : 400 })
          : receipt(),
      )

      await t.action(internal.worker.drain, {})

      expect(sent).toEqual(invalidCredentials ? ['rejected:0'] : ['rejected:0', 'next:0', 'next:1'])
      expect(await outcome(t, rejected)).toBe('failed')
      const stored = await results(t, rejected)
      expect(stored).toHaveLength(1)
      expect(stored[0]?.result).toMatchObject({ error: { code }, kind: 'failed' })
      expect(await outcome(t, next)).toBe(invalidCredentials ? 'cancelled' : 'succeeded')
      const registrations = await t.query(api.api.listWebhooks, {})
      expect(registrations[0]?.invalidatedAt !== undefined).toBe(invalidCredentials)
    },
  )
}
