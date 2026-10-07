import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { convexTest } from 'convex-test'
import type { FunctionReturnType, GenericSchema, SchemaDefinition } from 'convex/server'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { required } from './queue'
import schema from './schema'

const START = Date.UTC(2026, 9, 7, 10)
const batchRoot = path.join(
  path.dirname(fileURLToPath(import.meta.resolve('@convex-dev/batch-worker/package.json'))),
  'src/component',
)
const loadedBatchSchema: unknown = await import(path.join(batchRoot, 'schema.ts'))
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The installed component exports its schema at this path, loaded dynamically because its test helper requires Vite.
const batchSchemaModule = loadedBatchSchema as { default: SchemaDefinition<GenericSchema, boolean> }

function modules(root: string) {
  return Object.fromEntries(
    [...new Bun.Glob('**/*.ts').scanSync({ absolute: true, cwd: root })]
      .filter((path) => !path.endsWith('.test.ts'))
      .map((path) => [path, async (): Promise<unknown> => await import(path)]),
  )
}

function setup() {
  const t = convexTest({ modules: modules(import.meta.dir), schema, transactionLimits: true })
  t.registerComponent('batchWorker', batchSchemaModule.default, modules(batchRoot))
  return t
}
type Harness = ReturnType<typeof setup>

async function destination(t: Harness, key = 'first', url = `https://example.test/webhook/${key}`) {
  return await t.mutation(api.api.registerDestination, { key, url })
}
async function enqueue(
  t: Harness,
  key: string,
  sendAt = START,
  count = 1,
  destinationKey = 'first',
  extra: { maxAgeMs?: number; maxAttempts?: number; deadLetterDestinationKey?: string } = {},
) {
  return await t.mutation(api.api.enqueue, {
    destinationKey,
    key,
    messages: Array.from({ length: count }, (_, i) => ({
      key: `${key}:${i}`,
      payload: JSON.stringify({ content: `${key}:${i}` }),
    })),
    sendAt,
    ...extra,
  })
}
async function tick(t: Harness) {
  await t.mutation(internal.worker.run, {})
}
async function current(t: Harness) {
  return await t.run(async (ctx) => {
    const control = await ctx.db.query('control').unique()
    if (!control?.activeAttemptId) {
      return null
    }
    const attempt = await ctx.db.get(control.activeAttemptId)
    if (!attempt) {
      throw new Error('Missing active attempt')
    }
    return attempt
  })
}
async function settle(
  t: Harness,
  status = 200,
  extra: { retryAfterMs?: number; error?: string } = {},
) {
  const attempt = await current(t)
  if (!attempt) {
    throw new Error('No request to settle')
  }
  await t.mutation(internal.worker.recordResult, {
    attemptId: attempt._id,
    response: {
      body: JSON.stringify({ id: `remote-${attempt._id}` }),
      headers: {},
      messageId: `remote-${attempt._id}`,
      status,
      ...extra,
    },
  })
  await tick(t)
  return attempt
}
async function task(t: Harness, groupId: Id<'groups'>) {
  const group = await t.query(api.api.getGroup, { groupId })
  if (!group) {
    throw new Error('Missing group')
  }
  return group.task
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(START)
})
afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('serialized durable delivery', () => {
  test('chooses oldest eligible group, preserves message order, and never interleaves destinations', async () => {
    const t = setup()
    await destination(t)
    await destination(t, 'second')
    const later = await enqueue(t, 'later', START, 2, 'second')
    const earlier = await enqueue(t, 'earlier', START - 1000, 3)
    const seen = []
    for (let index = 0; index < 5; index += 1) {
      await tick(t)
      const attempt = await current(t)
      expect(attempt).not.toBeNull()
      seen.push(required(attempt).groupId)
      // A stale Batch Worker batch cannot open another request while this one is pending.
      await tick(t)
      const observed1 = await current(t)
      expect(observed1?._id).toBe(required(attempt)._id)
      await settle(t)
    }
    expect(seen).toEqual([earlier, earlier, earlier, later, later])
    const observed2 = await task(t, earlier)
    expect(observed2.status).toBe('succeeded')
    const observed3 = await task(t, later)
    expect(observed3.status).toBe('succeeded')
  })

  test('retains an active group when an older historical group arrives late', async () => {
    const t = setup()
    await destination(t)
    const active = await enqueue(t, 'active', START, 2)
    await tick(t)
    await settle(t)
    const historical = await enqueue(t, 'historical', START - 60_000)
    await tick(t)
    const observed4 = await current(t)
    expect(observed4?.groupId).toBe(active)
    await settle(t)
    await tick(t)
    const observed5 = await current(t)
    expect(observed5?.groupId).toBe(historical)
  })

  test('future work sleeps, newly enqueued earlier work wakes, and expired history records no attempt', async () => {
    const t = setup()
    await destination(t)
    const future = await enqueue(t, 'future', START + 60_000)
    const observed6 = await t.query(internal.worker.getBatch, { name: 'delivery' })
    expect(observed6).toMatchObject({
      kind: 'idle',
      timeoutMs: 60_000,
    })
    await tick(t)
    const observed7 = await current(t)
    expect(observed7).toBeNull()
    const expired = await enqueue(t, 'expired', START - 60_000, 2, 'first', { maxAgeMs: 1000 })
    await tick(t)
    const observed8 = await task(t, expired)
    expect(observed8.status).toBe('expired')
    const observed9 = await t.query(api.api.listAttempts, {})
    expect(observed9).toEqual([])
    jest.setSystemTime(START + 60_000)
    await tick(t)
    const observed10 = await current(t)
    expect(observed10?.groupId).toBe(future)
  })

  test('keeps an accepted message when the group expires during its HTTP attempt', async () => {
    const t = setup()
    await destination(t)
    const group = await enqueue(t, 'partial', START, 3, 'first', { maxAgeMs: 1000 })
    await tick(t)
    jest.setSystemTime(START + 2000)
    await settle(t)
    await tick(t)
    const observed11 = await task(t, group)
    expect(observed11).toMatchObject({ cursor: 1, status: 'expired' })
    const messages = await t.query(api.api.listMessages, { groupId: group })
    expect(messages.map((message) => message.status)).toEqual(['sent', 'expired', 'expired'])
    const observed12 = await t.query(api.api.listAttempts, {})
    expect(observed12).toHaveLength(1)
  })

  test('preflight refuses delayed scheduled sends after expiry and records unsent terminal state', async () => {
    const t = setup()
    await destination(t)
    const group = await enqueue(t, 'delayed', START, 1, 'first', { maxAgeMs: 1000 })
    await tick(t)
    const attempt = required(await current(t))
    jest.setSystemTime(START + 1000)
    const observed13 = await t.query(internal.request.readRequest, { attemptId: attempt._id })
    expect(observed13).toEqual({
      skipped: 'expired',
    })
    await t.action(internal.request.execute, { attemptId: attempt._id })
    await tick(t)
    const observed14 = await task(t, group)
    expect(observed14.status).toBe('expired')
  })

  test('429 waits globally without yielding group ownership, then retries the same message', async () => {
    const t = setup()
    await destination(t)
    await destination(t, 'second')
    const first = await enqueue(t, 'rate-limited', START, 2)
    const next = await enqueue(t, 'other', START + 1, 1, 'second')
    await tick(t)
    const original = await settle(t, 429, { retryAfterMs: 2500 })
    jest.setSystemTime(START + 2499)
    await tick(t)
    const observed15 = await current(t)
    expect(observed15).toBeNull()
    const observed16 = await task(t, next)
    expect(observed16.status).toBe('queued')
    jest.setSystemTime(START + 2500)
    await tick(t)
    const observed17 = await current(t)
    expect(observed17).toMatchObject({
      groupId: first,
      messageId: original.messageId,
      number: 2,
    })
    await settle(t)
    await tick(t)
    const observed18 = await current(t)
    expect(observed18?.groupId).toBe(first)
  })

  test('successful exhausted-bucket response delays the next group globally', async () => {
    const t = setup()
    await destination(t)
    await enqueue(t, 'first')
    const next = await enqueue(t, 'next', START + 1)
    await tick(t)
    await settle(t, 200, { retryAfterMs: 3000 })
    jest.setSystemTime(START + 1000)
    await tick(t)
    const observed19 = await current(t)
    expect(observed19).toBeNull()
    jest.setSystemTime(START + 3000)
    await tick(t)
    const observed20 = await current(t)
    expect(observed20?.groupId).toBe(next)
  })

  test('a canceled request recovers as uncertain, retries, and ignores stale duplicate results', async () => {
    const t = setup()
    await destination(t)
    const group = await enqueue(t, 'recover')
    await tick(t)
    const old = required(await current(t))
    await t.run(async (ctx) => {
      await ctx.scheduler.cancel(required(old.scheduledId))
    })
    await tick(t)
    const recovered = await t.query(api.api.listAttempts, { messageId: old.messageId })
    expect(recovered[0]?.result).toMatchObject({ recovered: true, response: { status: null } })
    jest.setSystemTime(START + 1000)
    await tick(t)
    const next = required(await current(t))
    expect(next.number).toBe(2)
    await t.mutation(internal.worker.recordResult, {
      attemptId: old._id,
      response: { body: '{}', headers: {}, messageId: 'late', status: 200 },
    })
    const observed21 = await current(t)
    expect(observed21?._id).toBe(next._id)
    await settle(t)
    await t.mutation(internal.worker.recordResult, {
      attemptId: next._id,
      response: { body: '', headers: {}, status: 500 },
    })
    const observed22 = await task(t, group)
    expect(observed22).toMatchObject({ cursor: 1, status: 'succeeded' })
    const observed23 = await t.query(api.api.listAttempts, { messageId: old.messageId })
    expect(observed23).toHaveLength(2)
  })

  test('pending and in-progress actions remain exclusive, but success without completion recovers', async () => {
    const t = setup()
    await destination(t)
    await enqueue(t, 'scheduler-states')
    await tick(t)
    const attempt = required(await current(t))
    jest.setSystemTime(START + 600_000)
    await tick(t)
    const observed24 = await current(t)
    expect(observed24?._id).toBe(attempt._id)
    for (const kind of ['inProgress', 'success'] as const) {
      await t.run(async (ctx) => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Inject scheduler-only states to simulate a crashed action; application functions cannot normally write system rows.
        const db = ctx.db as unknown as {
          patch: (id: string, fields: { state: { kind: string } }) => Promise<void>
        }
        await db.patch(required(attempt.scheduledId), { state: { kind } })
      })
      await tick(t)
      if (kind === 'inProgress') {
        const observed25 = await current(t)
        expect(observed25?._id).toBe(attempt._id)
      }
    }
    const observed26 = await current(t)
    expect(observed26).toBeNull()
    const history = await t.query(api.api.listAttempts, { messageId: attempt.messageId })
    expect(history[0]?.result?.response.error).toContain('success')
    expect(history[0]?.result?.recovered).toBe(true)
  })

  test('dedupe rejects changed content and scopes identity to destination and intended time', async () => {
    const t = setup()
    await destination(t)
    await destination(t, 'second')
    const original = await enqueue(t, 'repeat')
    const observed27 = await enqueue(t, 'repeat')
    expect(observed27).toBe(original)
    const observed28 = await enqueue(t, 'repeat', START + 1)
    expect(observed28).not.toBe(original)
    const observed29 = await enqueue(t, 'repeat', START, 1, 'second')
    expect(observed29).not.toBe(original)
    await rejects(enqueue(t, 'repeat', START, 2), /different content/)
    const observed30 = await t.query(api.api.listGroups, {})
    expect(observed30).toHaveLength(3)
  })

  test('permanent send failure terminates the group and prevents retries against a disabled destination', async () => {
    const t = setup()
    await destination(t)
    const bad = await enqueue(t, 'bad', START, 3)
    const next = await enqueue(t, 'next')
    await tick(t)
    await settle(t, 404)
    await tick(t)
    const observed31 = await task(t, bad)
    expect(observed31).toMatchObject({ cursor: 0, status: 'failed' })
    const observed32 = await task(t, next)
    expect(observed32).toMatchObject({
      reason: 'Destination disabled: HTTP 404',
      status: 'failed',
    })
    const observed33 = await t.query(api.api.listAttempts, {})
    expect(observed33).toHaveLength(1)
  })

  test('maxAttempts bounds transient failures and retains every response', async () => {
    const t = setup()
    await destination(t)
    const group = await enqueue(t, 'exhaust', START, 2, 'first', { maxAttempts: 2 })
    await tick(t)
    await settle(t, 503)
    jest.setSystemTime(START + 1000)
    await tick(t)
    await settle(t, 503)
    const observed34 = await task(t, group)
    expect(observed34).toMatchObject({ attemptsUsed: 2, cursor: 0, status: 'failed' })
    const observed35 = await t.query(api.api.listAttempts, {})
    expect(observed35).toHaveLength(2)
  })

  test('pause stops not-yet-started requests, resumes the group, and does not consume retry allowance', async () => {
    const t = setup()
    await destination(t)
    const group = await enqueue(t, 'paused')
    await tick(t)
    const attempt = required(await current(t))
    await t.mutation(api.api.setPaused, { paused: true })
    await t.action(internal.request.execute, { attemptId: attempt._id })
    await tick(t)
    const observed36 = await task(t, group)
    expect(observed36).toMatchObject({ attemptsUsed: 0, status: 'active' })
    await tick(t)
    const observed37 = await current(t)
    expect(observed37).toBeNull()
    await t.mutation(api.api.setPaused, { paused: false })
    await tick(t)
    const observed38 = await current(t)
    expect(observed38?.number).toBe(1)
  })

  test('receipt operations preserve original payload and webhook snapshot after destination rotation', async () => {
    const t = setup()
    await destination(t)
    const groupId = await enqueue(t, 'original')
    await tick(t)
    await settle(t)
    const [original] = await t.query(api.api.listMessages, { groupId })
    await destination(t, 'first', 'https://example.test/new-hook')
    const edit = await t.mutation(api.api.manageMessage, {
      key: 'correction',
      messageId: original.message._id,
      operation: 'edit',
      payload: '{"content":"corrected"}',
      sendAt: START,
    })
    await tick(t)
    const active = required(await current(t))
    const observed39 = await t.query(internal.request.readRequest, { attemptId: active._id })
    expect(observed39).toMatchObject({
      operation: 'edit',
      payload: '{"content":"corrected"}',
      url: 'https://example.test/webhook/first',
    })
    await settle(t)
    const observed40 = await task(t, edit)
    expect(observed40.status).toBe('succeeded')
    const observed41 = await t.query(api.api.getMessage, { messageId: original.message._id })
    expect(observed41).toEqual(original)
    const deletion = await t.mutation(api.api.manageMessage, {
      key: 'delete',
      messageId: original.message._id,
      operation: 'delete',
      sendAt: START,
    })
    await tick(t)
    await settle(t, 404)
    const observed42 = await task(t, deletion)
    expect(observed42.status).toBe('failed')
    const observed43 = await t.query(api.api.listDestinations, {})
    expect(observed43[0]).not.toHaveProperty('disabledReason')
  })

  test('an expired group forwards one terminal report, and a failed report cannot recurse', async () => {
    const t = setup()
    await destination(t)
    await destination(t, 'sink')
    const expired = await enqueue(t, 'expired', START - 1000, 2, 'first', {
      deadLetterDestinationKey: 'sink',
      maxAgeMs: 10,
    })
    await tick(t)
    const observed44 = await task(t, expired)
    expect(observed44.status).toBe('expired')
    const groups = await t.query(api.api.listGroups, {})
    expect(groups).toHaveLength(2)
    const report = required(groups.find((view) => view.group.destinationKey === 'sink'))
    expect(report.group.deadLetterDestinationKey).toBeUndefined()
    await tick(t)
    await settle(t, 400)
    const observed45 = await task(t, report.group._id)
    expect(observed45.status).toBe('failed')
    const observed46 = await t.query(api.api.listGroups, {})
    expect(observed46).toHaveLength(2)
  })

  test('Batch Worker scheduled loop drives actual transport and persists returned receipts', async () => {
    const t = setup()
    await destination(t)
    const requests: string[] = []
    const fetcher = Object.assign(
      async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        if (typeof init?.body !== 'string') {
          throw new TypeError('Expected serialized payload')
        }
        requests.push(init.body)
        return Response.json({ content: 'confirmed', id: `discord-${requests.length}` })
      },
      { preconnect: fetch.preconnect },
    )
    const request = spyOn(globalThis, 'fetch').mockImplementation(fetcher)
    try {
      const first = await enqueue(t, 'scheduler-first', START, 2)
      const second = await enqueue(t, 'scheduler-second', START + 10, 1)
      await t.finishAllScheduledFunctions(() => {
        jest.runAllTimers()
      })
      expect(requests).toEqual([
        '{"content":"scheduler-first:0"}',
        '{"content":"scheduler-first:1"}',
        '{"content":"scheduler-second:0"}',
      ])
      const observed47 = await task(t, first)
      expect(observed47.status).toBe('succeeded')
      const observed48 = await task(t, second)
      expect(observed48.status).toBe('succeeded')
      const messages = await t.query(api.api.listMessages, { groupId: first })
      expect(messages.map((message) => message.result?.response.messageId)).toEqual([
        'discord-1',
        'discord-2',
      ])
    } finally {
      request.mockRestore()
    }
  })

  test('forensic pagination crosses equal-time groups and exposes actual delivery time separately', async () => {
    const t = setup()
    await destination(t)
    for (let index = 0; index < 5; index += 1) {
      await enqueue(t, `history-${index}`, START - 60_000)
    }
    const seen: string[] = []
    let cursor: string | null = null
    let done = false
    while (!done) {
      const page: FunctionReturnType<typeof api.history.groups> = await t.query(
        api.history.groups,
        {
          from: START - 60_000,
          paginationOpts: { cursor, numItems: 2 },
          to: START - 60_000,
        },
      )
      seen.push(...page.page.map((view) => view.group.key))
      cursor = page.continueCursor
      done = page.isDone
    }
    expect(new Set(seen).size).toBe(5)
    expect(seen).toHaveLength(5)
    await tick(t)
    jest.setSystemTime(START + 60_000)
    await settle(t)
    const responses = await t.query(api.history.results, {
      from: START + 60_000,
      paginationOpts: { cursor: null, numItems: 2 },
      to: START + 60_000,
    })
    expect(responses.page).toHaveLength(1)
    expect(responses.page[0]?.completedAt).toBe(START + 60_000)
    const delivered = await t.query(api.history.attempts, {
      from: START,
      paginationOpts: { cursor: null, numItems: 2 },
      to: START,
    })
    expect(delivered.page).toHaveLength(1)
    expect(delivered.page[0]?.attempt.startedAt).toBe(START)
    expect(delivered.page[0]?.result?.response.messageId).toBeDefined()
    const observed49 = await t.query(api.api.listGroups, { from: START, to: START })
    expect(observed49).toEqual([])
  })

  test('DELETE unknown-message confirms absence while preserving the raw 404 receipt', async () => {
    const t = setup()
    await destination(t)
    const groupId = await enqueue(t, 'already-deleted')
    await tick(t)
    await settle(t)
    const originalMessages = await t.query(api.api.listMessages, { groupId })
    const original = required(originalMessages[0])
    const deletion = await t.mutation(api.api.manageMessage, {
      key: 'delete-again',
      messageId: original.message._id,
      operation: 'delete',
      sendAt: START,
    })
    await tick(t)
    const attempt = required(await current(t))
    const body = JSON.stringify({ code: 10_008, message: 'Unknown Message' })
    await t.mutation(internal.worker.recordResult, {
      attemptId: attempt._id,
      response: { body, headers: {}, status: 404 },
    })
    await tick(t)
    const completed = await task(t, deletion)
    expect(completed.status).toBe('succeeded')
    const messages = await t.query(api.api.listMessages, { groupId: deletion })
    expect(messages[0]).toMatchObject({
      result: { response: { body, status: 404 } },
      status: 'completed',
    })
    const destinations = await t.query(api.api.listDestinations, {})
    expect(destinations[0]).not.toHaveProperty('disabledReason')
  })

  test('concurrent duplicate admission creates exactly one immutable group and task', async () => {
    const t = setup()
    await destination(t)
    const admitted = await Promise.all(
      Array.from({ length: 8 }, async () => await enqueue(t, 'concurrent')),
    )
    expect(new Set(admitted).size).toBe(1)
    const inventory = await t.run(async (ctx) => ({
      groups: await ctx.db.query('groups').collect(),
      messages: await ctx.db.query('messages').collect(),
      tasks: await ctx.db.query('tasks').collect(),
    }))
    expect(inventory.groups).toHaveLength(1)
    expect(inventory.tasks).toHaveLength(1)
    expect(inventory.messages).toHaveLength(1)
  })
})
