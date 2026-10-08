import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { convexTest } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { pool } from './pool'
import schema from './schema'
import * as transport from './transport'

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

function mockFetch(handler: (url: URL, body: string) => Promise<Response>) {
  const implementation = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const request = new Request(input, init)
      return await handler(new URL(request.url), await request.text())
    },
    { preconnect: fetch.preconnect },
  )
  return spyOn(globalThis, 'fetch').mockImplementation(implementation)
}

async function registerWebhook(t: Harness, index = 0, query = '') {
  return await t.mutation(api.api.registerWebhook, {
    name: `recipient-${index}`,
    url: `https://discord.com/api/webhooks/${100_000_000_000_000_000n + BigInt(index)}/test-token-${index}${query}`,
  })
}

const messages = [
  { key: 'model-a-overview', payload: JSON.stringify({ content: 'Model A overview' }) },
  { key: 'model-a-pricing', payload: JSON.stringify({ content: 'Model A pricing' }) },
  { key: 'model-b-overview', payload: JSON.stringify({ content: 'Model B overview' }) },
]

async function submit(
  t: Harness,
  webhookId: Id<'webhooks'>,
  options: { expiresAt?: number; key?: string; messages?: typeof messages } = {},
) {
  return await t.mutation(api.api.submitBatch, {
    expiresAt: START + 3_600_000,
    key: 'ingestion-1',
    messages,
    webhookId,
    ...options,
  })
}

async function advance(t: Harness, milliseconds = 10) {
  // Small increments exercise Workpool scheduling without jumping immediately to
  // its recovery timers or turning a short cooldown into a test-time expiry.
  await t.finishAllScheduledFunctions(() => {
    jest.advanceTimersByTime(milliseconds)
  })
}

async function drain(t: Harness) {
  for (let tick = 0; tick < 2000; tick += 1) {
    await advance(t)

    const unfinished = await t.run(async (ctx) => {
      const jobs = await ctx.db.query('jobs').collect()
      return jobs.some((job) => job.finishedAt === undefined)
    })

    if (!unfinished) {
      await t.finishAllScheduledFunctions(() => {
        jest.runAllTimers()
      })
      return
    }
  }
  throw new Error('Workpool did not finish the submitted jobs')
}

async function waitForCooldown(t: Harness, jobId: Id<'jobs'>) {
  for (let tick = 0; tick < 100; tick += 1) {
    await advance(t)
    const job = await t.query(api.api.getJob, { jobId })

    if (job !== null && job.availableAt > Date.now() && job.finishedAt === undefined) {
      return job
    }
  }
  throw new Error('Expected a checkpointed job waiting for its cooldown')
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

describe('serial job draining', () => {
  test('sends each ordered job completely and only persists terminal message results', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const firstJob = await submit(t, webhookId)
    const secondJob = await submit(t, webhookId, { key: 'ingestion-2' })
    const calls: string[] = []
    const resultCountsBeforeHttp: number[] = []
    const waitParameters: Array<string | null> = []

    mockFetch(async (url, body) => {
      const jobId = calls.length < messages.length ? firstJob : secondJob
      const results = await t.query(api.api.listResults, { jobId })
      resultCountsBeforeHttp.push(results.length)
      waitParameters.push(url.searchParams.get('wait'))
      calls.push(body)
      return Response.json(
        { channel_id: 'channel', id: `message-${calls.length}` },
        { headers: { 'x-ratelimit-remaining': '4' } },
      )
    })

    await drain(t)

    expect(calls).toEqual([...messages, ...messages].map(({ payload }) => payload))
    expect(resultCountsBeforeHttp).toEqual([0, 1, 2, 0, 1, 2])
    expect(waitParameters).toEqual(Array.from({ length: 6 }, () => 'true'))

    for (const [jobIndex, jobId] of [firstJob, secondJob].entries()) {
      const job = await t.query(api.api.getJob, { jobId })
      expect(job).toMatchObject({ messages, outcome: 'succeeded', retryCount: 0, webhookId })
      expect(job?.finishedAt).toBeDefined()
      const results = await t.query(api.api.listResults, { jobId })
      expect(results).toHaveLength(messages.length)
      expect(results.map(({ messageKey }) => messageKey)).toEqual(messages.map(({ key }) => key))

      for (const [index, row] of results.entries()) {
        expect(row).not.toHaveProperty('payload')
        expect(row).not.toHaveProperty('attempts')
        expect(row).toMatchObject({
          jobId,
          result: {
            kind: 'succeeded',
            response: {
              body: JSON.stringify({
                channel_id: 'channel',
                id: `message-${jobIndex * 3 + index + 1}`,
              }),
              channelId: 'channel',
              headers: { 'x-ratelimit-remaining': '4' },
              messageId: `message-${jobIndex * 3 + index + 1}`,
              status: 200,
            },
          },
        })
      }
    }
  })

  test('redundant wake requests share one Workpool slot and never overlap HTTP', async () => {
    const t = setup()
    const firstWebhook = await registerWebhook(t)
    const secondWebhook = await registerWebhook(t, 1)
    await submit(t, firstWebhook)
    await submit(t, secondWebhook, { key: 'ingestion-2' })
    await t.mutation(api.api.resume, {})
    await t.mutation(api.api.resume, {})
    const started = Promise.withResolvers<null>()
    const release = Promise.withResolvers<null>()
    let active = 0
    let maximumActive = 0
    let requests = 0

    mockFetch(async () => {
      requests += 1
      active += 1
      maximumActive = Math.max(maximumActive, active)

      if (requests === 1) {
        started.resolve(null)
        await release.promise
      }

      await setImmediate()
      active -= 1
      return Response.json({ id: `receipt-${requests}` })
    })

    const scheduled = drain(t)

    try {
      await started.promise
      await setImmediate()
      expect(requests).toBe(1)
      expect(active).toBe(1)
    } finally {
      release.resolve(null)
      await scheduled
    }

    expect(requests).toBe(6)
    expect(maximumActive).toBe(1)
  })

  test('a retry checkpoints the current message, switches jobs, and resumes without replaying its prefix', async () => {
    const t = setup()
    const firstWebhook = await registerWebhook(t)
    const secondWebhook = await registerWebhook(t, 1)
    const firstJob = await submit(t, firstWebhook)
    const secondJob = await submit(t, secondWebhook, { key: 'ingestion-2' })
    const calls: Array<{ body: string; recipient: string; at: number }> = []
    let rejectedAt = 0
    let retryCountAtResumedAttempt: number | undefined
    let retryCountAfterSuccess: number | undefined
    let firstRecipientAttempts = 0

    mockFetch(async (url, body) => {
      const recipient = url.pathname.endsWith('test-token-0') ? 'first' : 'second'
      calls.push({ at: Date.now(), body, recipient })

      if (recipient === 'first') {
        firstRecipientAttempts += 1

        if (firstRecipientAttempts === 2) {
          rejectedAt = Date.now()
          return new Response('temporarily unavailable', { status: 503 })
        }

        if (firstRecipientAttempts === 3) {
          const job = await t.query(api.api.getJob, { jobId: firstJob })
          retryCountAtResumedAttempt = job?.retryCount
        }

        if (firstRecipientAttempts === 4) {
          const job = await t.query(api.api.getJob, { jobId: firstJob })
          retryCountAfterSuccess = job?.retryCount
        }
      }

      return Response.json({ id: `receipt-${calls.length}` })
    })

    await drain(t)

    expect(calls.map(({ recipient }) => recipient)).toEqual([
      'first',
      'first',
      'second',
      'second',
      'second',
      'first',
      'first',
    ])
    expect(calls.filter(({ recipient }) => recipient === 'first').map(({ body }) => body)).toEqual([
      messages[0].payload,
      messages[1].payload,
      messages[1].payload,
      messages[2].payload,
    ])
    expect(calls[5].at).toBeGreaterThanOrEqual(rejectedAt + 1000)
    expect(retryCountAtResumedAttempt).toBe(1)
    expect(retryCountAfterSuccess).toBe(0)

    for (const jobId of [firstJob, secondJob]) {
      const results = await t.query(api.api.listResults, { jobId })
      expect(results).toHaveLength(3)
      expect(results.every(({ result }) => result.kind === 'succeeded')).toBe(true)
      expect(await t.query(api.api.getJob, { jobId })).toMatchObject({ outcome: 'succeeded' })
    }
  })

  test('when all jobs are cooling down the action returns and a later wake resumes them', async () => {
    const t = setup()
    const firstWebhook = await registerWebhook(t)
    const secondWebhook = await registerWebhook(t, 1)
    const firstJob = await submit(t, firstWebhook)
    const secondJob = await submit(t, secondWebhook, { key: 'ingestion-2' })
    const calls = new Map<string, number[]>()

    mockFetch(async (url) => {
      const attempts = calls.get(url.pathname) ?? []
      attempts.push(Date.now())
      calls.set(url.pathname, attempts)
      return attempts.length === 1
        ? new Response('try later', { status: 503 })
        : Response.json({ id: `receipt-${attempts.length}` })
    })

    // finishAllScheduledFunctions waits for actions that actually started. Reaching
    // these checkpoints before availableAt proves the action put both jobs down.
    const firstWaiting = await waitForCooldown(t, firstJob)
    const secondWaiting = await waitForCooldown(t, secondJob)

    for (const waiting of [firstWaiting, secondWaiting]) {
      expect(waiting.retryCount).toBe(1)
      expect(waiting.availableAt).toBeGreaterThan(Date.now())
      expect(await t.query(api.api.listResults, { jobId: waiting._id })).toEqual([])
    }

    expect([...calls.values()].map((attempts) => attempts.length)).toEqual([1, 1])

    await drain(t)

    for (const [index, attempts] of [...calls.values()].entries()) {
      expect(attempts).toHaveLength(4)
      expect(attempts[1]).toBeGreaterThanOrEqual([firstWaiting, secondWaiting][index].availableAt)
    }

    for (const jobId of [firstJob, secondJob]) {
      expect(await t.query(api.api.getJob, { jobId })).toMatchObject({
        outcome: 'succeeded',
        retryCount: 0,
      })
    }
  })

  test('a new eligible job brings a future wake forward without bypassing an existing cooldown', async () => {
    const t = setup()
    const firstWebhook = await registerWebhook(t)
    const otherWebhook = await registerWebhook(t, 1)
    const firstJob = await submit(t, firstWebhook, { messages: messages.slice(0, 1) })
    const calls: Array<{ at: number; body: string }> = []

    mockFetch(async (_url, body) => {
      calls.push({ at: Date.now(), body })
      return calls.length === 1
        ? Response.json({ retry_after: 2 }, { status: 429 })
        : Response.json({ id: `receipt-${calls.length}` })
    })

    const waiting = await waitForCooldown(t, firstJob)
    const newJob = await submit(t, otherWebhook, { key: 'new-job', messages: messages.slice(1, 2) })

    await drain(t)

    expect(calls.map(({ body }) => body)).toEqual([
      messages[0].payload,
      messages[1].payload,
      messages[0].payload,
    ])
    expect(calls[1].at).toBeLessThan(waiting.availableAt)
    expect(calls[2].at).toBeGreaterThanOrEqual(waiting.availableAt)
    expect(await t.query(api.api.getJob, { jobId: newJob })).toMatchObject({ outcome: 'succeeded' })
  })

  test('an exhausted successful webhook bucket gates other jobs and threads while another webhook proceeds', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const threadWebhookId = await registerWebhook(t, 0, '?thread_id=thread-2')
    const independentWebhookId = await registerWebhook(t, 1)
    await submit(t, webhookId, { messages: messages.slice(0, 1) })
    await submit(t, threadWebhookId, { key: 'same-webhook-thread', messages: messages.slice(1, 2) })
    await submit(t, independentWebhookId, {
      key: 'different-webhook',
      messages: messages.slice(2, 3),
    })
    const calls: Array<{ at: number; body: string }> = []

    mockFetch(async (_url, body) => {
      calls.push({ at: Date.now(), body })
      return Response.json(
        { id: `receipt-${calls.length}` },
        {
          headers:
            calls.length === 1
              ? { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset-After': '2' }
              : {},
        },
      )
    })

    await drain(t)

    expect(calls.map(({ body }) => body)).toEqual([
      messages[0].payload,
      messages[2].payload,
      messages[1].payload,
    ])
    expect(calls[1].at).toBeLessThan(calls[0].at + 2000)
    expect(calls[2].at).toBeGreaterThanOrEqual(calls[0].at + 2000)
  })

  test('a global 429 prevents switching to an otherwise eligible webhook', async () => {
    const t = setup()
    const firstWebhook = await registerWebhook(t)
    const secondWebhook = await registerWebhook(t, 1)
    await submit(t, firstWebhook, { messages: messages.slice(0, 1) })
    await submit(t, secondWebhook, { key: 'ingestion-2', messages: messages.slice(1, 2) })
    const calls: Array<{ at: number; body: string }> = []

    mockFetch(async (_url, body) => {
      calls.push({ at: Date.now(), body })
      return calls.length === 1
        ? Response.json(
            { global: true, retry_after: 2 },
            { headers: { 'X-RateLimit-Global': 'true' }, status: 429 },
          )
        : Response.json({ id: `receipt-${calls.length}` })
    })

    await drain(t)

    expect(calls.map(({ body }) => body)).toEqual([
      messages[0].payload,
      messages[0].payload,
      messages[1].payload,
    ])
    expect(calls[1].at).toBeGreaterThanOrEqual(calls[0].at + 2000)
    expect(calls[2].at).toBeGreaterThanOrEqual(calls[0].at + 2000)
  })

  test('a permanent rejection stops only its job and stores the final failed response', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const failedJob = await submit(t, webhookId)
    const nextJob = await submit(t, webhookId, { key: 'ingestion-2' })
    let requests = 0

    mockFetch(async () => {
      requests += 1
      return requests === 2
        ? Response.json({ code: 50_006, message: 'Cannot send an empty message' }, { status: 400 })
        : Response.json({ id: `receipt-${requests}` })
    })

    await drain(t)

    expect(requests).toBe(5)
    expect(await t.query(api.api.getJob, { jobId: failedJob })).toMatchObject({ outcome: 'failed' })
    const results = await t.query(api.api.listResults, { jobId: failedJob })
    expect(results.map(({ result }) => result.kind)).toEqual(['succeeded', 'failed'])
    expect(results[1]).toMatchObject({
      messageKey: messages[1].key,
      result: {
        kind: 'failed',
        response: {
          body: JSON.stringify({ code: 50_006, message: 'Cannot send an empty message' }),
          status: 400,
        },
      },
    })
    expect(await t.query(api.api.getJob, { jobId: nextJob })).toMatchObject({
      outcome: 'succeeded',
    })
  })

  test('Workpool retries an unexpected action failure from the durable successful prefix', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const jobId = await submit(t, webhookId)
    const { executeWebhook } = transport
    let transportCalls = 0
    const bodies: string[] = []

    // This is an action failure, rather than a Discord/network response. Workpool
    // owns the retry; the sender must neither invent a message failure nor resend
    // the message whose terminal receipt was already committed.
    spyOn(transport, 'executeWebhook').mockImplementation(async (...args) => {
      transportCalls += 1

      if (transportCalls === 2) {
        throw new Error('One-shot action interruption')
      }

      return await executeWebhook(...args)
    })

    mockFetch(async (_url, body) => {
      bodies.push(body)
      return Response.json({ id: `receipt-${bodies.length}` })
    })

    await drain(t)

    expect(transportCalls).toBe(4)
    expect(bodies).toEqual(messages.map(({ payload }) => payload))
    expect(await t.query(api.api.getJob, { jobId })).toMatchObject({
      outcome: 'succeeded',
      retryCount: 0,
    })
    const results = await t.query(api.api.listResults, { jobId })
    expect(results).toHaveLength(3)
    expect(results.every(({ result }) => result.kind === 'succeeded')).toBe(true)
  })

  test('the action budget yields to a fresh Workpool drain without replaying its successful prefix', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const enqueues = spyOn(pool, 'enqueueAction')
    const jobId = await submit(t, webhookId, { expiresAt: START + 60 * 60 * 1000 })
    const bodies: string[] = []

    mockFetch(async (_url, body) => {
      bodies.push(body)

      if (bodies.length === 1) {
        // Move past the drain's 25-minute budget without advancing the HTTP timeout.
        // The successful response is checkpointed before the action yields its slot.
        jest.setSystemTime(START + 26 * 60 * 1000)
      }

      return Response.json({ id: `receipt-${bodies.length}` })
    })

    await drain(t)

    expect(enqueues).toHaveBeenCalledTimes(2)
    expect(bodies).toEqual(messages.map(({ payload }) => payload))
    expect(await t.query(api.api.getJob, { jobId })).toMatchObject({
      outcome: 'succeeded',
      retryCount: 0,
    })
    expect(await t.query(api.api.listResults, { jobId })).toHaveLength(messages.length)
  })

  test('submitting while a drain is running schedules a later pass for the new job', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const firstJob = await submit(t, webhookId, { messages: messages.slice(0, 1) })
    let nextJob: Id<'jobs'> | undefined
    const bodies: string[] = []

    mockFetch(async (_url, body) => {
      bodies.push(body)

      if (bodies.length === 1) {
        nextJob = await submit(t, webhookId, {
          key: 'submitted-during-drain',
          messages: messages.slice(1),
        })
      }

      return Response.json({ id: `receipt-${bodies.length}` })
    })

    await drain(t)

    expect(bodies).toEqual(messages.map(({ payload }) => payload))
    expect(nextJob).toBeDefined()

    if (nextJob === undefined) {
      throw new Error('Expected the concurrent submission to return a job')
    }

    for (const jobId of [firstJob, nextJob]) {
      expect(await t.query(api.api.getJob, { jobId })).toMatchObject({ outcome: 'succeeded' })
    }
  })
})

describe('expiry before attempts', () => {
  test('an already expired job is finalized without a result row or HTTP attempt', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const jobId = await submit(t, webhookId, { expiresAt: START - 1 })
    const fetcher = mockFetch(async () => Response.json({ id: 'should-not-send' }))

    await drain(t)

    expect(fetcher).not.toHaveBeenCalled()
    expect(await t.query(api.api.listResults, { jobId })).toEqual([])
    expect(await t.query(api.api.getJob, { jobId })).toMatchObject({ outcome: 'expired' })
  })

  test('a response received after expiry is preserved, then the unsent suffix expires', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const jobId = await submit(t, webhookId, { expiresAt: START + 60_000 })

    const fetcher = mockFetch(async () => {
      jest.setSystemTime(START + 120_000)
      return Response.json({ channel_id: 'channel', id: 'sent-before-deadline' })
    })

    await drain(t)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await t.query(api.api.listResults, { jobId })).toMatchObject([
      {
        messageKey: messages[0].key,
        result: { kind: 'succeeded', response: { messageId: 'sent-before-deadline' } },
      },
    ])
    expect(await t.query(api.api.getJob, { jobId })).toMatchObject({ outcome: 'expired' })
  })

  test('a final successful response after the deadline still completes its job', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const jobId = await submit(t, webhookId, {
      expiresAt: START + 60_000,
      messages: messages.slice(0, 1),
    })

    mockFetch(async () => {
      jest.setSystemTime(START + 120_000)
      return Response.json({ id: 'last-message' })
    })

    await drain(t)

    expect(await t.query(api.api.getJob, { jobId })).toMatchObject({ outcome: 'succeeded' })
    expect(await t.query(api.api.listResults, { jobId })).toHaveLength(1)
  })

  test('a cooldown beyond expiry wakes at the deadline and retains no transient response', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const jobId = await submit(t, webhookId, { expiresAt: START + 4000 })
    const fetcher = mockFetch(async () =>
      Response.json({ message: 'temporary', retry_after: 120 }, { status: 429 }),
    )

    await drain(t)

    const job = await t.query(api.api.getJob, { jobId })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(job).toMatchObject({ outcome: 'expired' })
    expect(job?.finishedAt).toBeGreaterThanOrEqual(START + 4000)
    expect(job?.finishedAt).toBeLessThan(START + 10_000)
    expect(job).not.toHaveProperty('response')
    expect(await t.query(api.api.listResults, { jobId })).toEqual([])
  })

  test('expiry removes a job from the active list and the next job can complete', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const expiredJob = await submit(t, webhookId, { expiresAt: START - 1 })
    const nextJob = await submit(t, webhookId, { key: 'still-current' })
    const bodies: string[] = []

    mockFetch(async (_url, body) => {
      bodies.push(body)
      return Response.json({ id: `receipt-${bodies.length}` })
    })

    await drain(t)

    expect(bodies).toEqual(messages.map(({ payload }) => payload))
    expect(await t.query(api.api.getJob, { jobId: expiredJob })).toMatchObject({
      outcome: 'expired',
    })
    expect(await t.query(api.api.getJob, { jobId: nextJob })).toMatchObject({
      outcome: 'succeeded',
    })
  })
})

describe('submission boundaries', () => {
  test('job discovery uses submission time with bounded results and an exclusive upper boundary', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const ids: Id<'jobs'>[] = []

    for (let index = 0; index < 3; index += 1) {
      jest.setSystemTime(START + index * 1000)
      ids.push(await submit(t, webhookId, { key: `discovery-${index}` }))
    }

    const bounded = await t.query(api.api.listJobs, { from: START, to: START + 2000 })
    expect(bounded.jobs.map(({ _id }) => _id).toSorted()).toEqual(ids.slice(0, 2).toSorted())
    expect(bounded.hasMore).toBe(false)
    expect(bounded.jobs.every((job) => job.messages[0].payload === messages[0].payload)).toBe(true)
    const limited = await t.query(api.api.listJobs, { from: START, limit: 1, to: START + 3000 })
    expect(limited.jobs).toHaveLength(1)
    expect(limited.hasMore).toBe(true)
    expect(await t.query(api.api.listJobs, { from: START + 3000, to: START + 4000 })).toEqual({
      hasMore: false,
      jobs: [],
    })
    await rejects(t.query(api.api.listJobs, { from: START, limit: 101, to: START + 3000 }))
  })

  test('invalid submissions leave no job, result or scheduled HTTP side effect', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const valid = { expiresAt: START + 3_600_000, key: 'invalid-batch', messages, webhookId }
    const invalidInputs = [
      { ...valid, key: '' },
      { ...valid, messages: [] },
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
    const fetcher = mockFetch(async () => Response.json({ id: 'should-not-send' }))

    for (const input of invalidInputs) {
      await rejects(t.mutation(api.api.submitBatch, input))
    }

    await drain(t)

    const rows = await t.run(async (ctx) => ({
      jobs: await ctx.db.query('jobs').collect(),
      results: await ctx.db.query('results').collect(),
    }))
    expect(rows).toEqual({ jobs: [], results: [] })
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

  test('payload bytes survive parsing and sending, and all immutable job fields participate in dedupe', async () => {
    const t = setup()
    const webhookId = await registerWebhook(t)
    const otherWebhookId = await registerWebhook(t, 1)
    const firstPayload =
      '  { "content" : "\\u0068ello \\u2603", "allowed_mentions" : { "parse" : [] } }\n'
    const original = {
      expiresAt: START + 3_600_000,
      key: 'byte-preserving-batch',
      messages: [
        { key: 'overview', payload: firstPayload },
        { key: 'pricing', payload: '{ "content": "Pricing", "embeds": [] }' },
      ],
      webhookId,
    }
    const jobId = await t.mutation(api.api.submitBatch, original)
    expect(await t.mutation(api.api.submitBatch, original)).toBe(jobId)
    const conflictingInputs = [
      { ...original, webhookId: otherWebhookId },
      { ...original, messages: original.messages.toReversed() },
      { ...original, expiresAt: original.expiresAt + 1 },
      {
        ...original,
        messages: original.messages.map((message) => ({
          ...message,
          key: `renamed-${message.key}`,
        })),
      },
      {
        ...original,
        messages: [
          { key: 'overview', payload: '{"content":"hello ☃","allowed_mentions":{"parse":[]}}' },
          original.messages[1],
        ],
      },
    ]

    for (const input of conflictingInputs) {
      await rejects(t.mutation(api.api.submitBatch, input))
    }

    const sentBodies: string[] = []

    mockFetch(async (_url, body) => {
      sentBodies.push(body)
      return Response.json({ channel_id: 'channel', id: `receipt-${sentBodies.length}` })
    })

    await drain(t)
    expect(await t.mutation(api.api.submitBatch, original)).toBe(jobId)
    await t.mutation(api.api.resume, {})
    await drain(t)

    expect(sentBodies).toEqual(original.messages.map(({ payload }) => payload))
    expect(await t.query(api.api.getJob, { jobId })).toMatchObject(original)
    expect(await t.query(api.api.listResults, { jobId })).toHaveLength(2)
    expect(await t.run(async (ctx) => await ctx.db.query('jobs').collect())).toHaveLength(1)
  })
})
