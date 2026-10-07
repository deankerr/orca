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
  {
    sendAt = START,
    messageCount = 1,
    destinationKey = 'first',
    ...policy
  }: {
    sendAt?: number
    messageCount?: number
    destinationKey?: string
    maxAgeMs?: number
    maxAttempts?: number
    deadLetterDestinationKey?: string
  } = {},
) {
  return await t.mutation(api.api.enqueue, {
    destinationKey,
    key,
    messages: Array.from({ length: messageCount }, (_, position) => ({
      key: `${key}:${position}`,
      payload: JSON.stringify({ content: `${key}:${position}` }),
    })),
    sendAt,
    ...policy,
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
    const later = await enqueue(t, 'later', { destinationKey: 'second', messageCount: 2 })
    const earlier = await enqueue(t, 'earlier', { messageCount: 3, sendAt: START - 1000 })
    const seen = []
    for (let index = 0; index < 5; index += 1) {
      await tick(t)
      const attempt = await current(t)
      expect(attempt).not.toBeNull()
      seen.push(required(attempt).groupId)
      // A stale Batch Worker batch cannot open another request while this one is pending.
      await tick(t)
      const retainedAttempt = await current(t)
      expect(retainedAttempt?._id).toBe(required(attempt)._id)
      await settle(t)
    }
    expect(seen).toEqual([earlier, earlier, earlier, later, later])
    const earlierTask = await task(t, earlier)
    expect(earlierTask.status).toBe('succeeded')
    const laterTask = await task(t, later)
    expect(laterTask.status).toBe('succeeded')
  })

  test('retains an active group when an older historical group arrives late', async () => {
    const t = setup()
    await destination(t)
    const active = await enqueue(t, 'active', { messageCount: 2 })
    await tick(t)
    await settle(t)
    const historical = await enqueue(t, 'historical', { sendAt: START - 60_000 })
    await tick(t)
    const activeGroupAttempt = await current(t)
    expect(activeGroupAttempt?.groupId).toBe(active)
    await settle(t)
    await tick(t)
    const historicalGroupAttempt = await current(t)
    expect(historicalGroupAttempt?.groupId).toBe(historical)
  })

  test('future work sleeps, newly enqueued earlier work wakes, and expired history records no attempt', async () => {
    const t = setup()
    await destination(t)
    const future = await enqueue(t, 'future', { sendAt: START + 60_000 })
    const futureBatch = await t.query(internal.worker.getBatch, { name: 'delivery' })
    expect(futureBatch).toMatchObject({
      kind: 'idle',
      timeoutMs: 60_000,
    })
    await tick(t)
    const beforeSendTime = await current(t)
    expect(beforeSendTime).toBeNull()
    const expired = await enqueue(t, 'expired', {
      maxAgeMs: 1000,
      messageCount: 2,
      sendAt: START - 60_000,
    })
    await tick(t)
    const expiredTask = await task(t, expired)
    expect(expiredTask.status).toBe('expired')
    const attemptsBeforeSendTime = await t.query(api.api.listAttempts, {})
    expect(attemptsBeforeSendTime).toEqual([])
    jest.setSystemTime(START + 60_000)
    await tick(t)
    const eligibleAttempt = await current(t)
    expect(eligibleAttempt?.groupId).toBe(future)
  })

  test('keeps an accepted message when the group expires during its HTTP attempt', async () => {
    const t = setup()
    await destination(t)
    const group = await enqueue(t, 'partial', { maxAgeMs: 1000, messageCount: 3 })
    await tick(t)
    jest.setSystemTime(START + 2000)
    await settle(t)
    await tick(t)
    const partiallyExpiredTask = await task(t, group)
    expect(partiallyExpiredTask).toMatchObject({ cursor: 1, status: 'expired' })
    const messages = await t.query(api.api.listMessages, { groupId: group })
    expect(messages.map((message) => message.status)).toEqual(['sent', 'expired', 'expired'])
    const attempts = await t.query(api.api.listAttempts, {})
    expect(attempts).toHaveLength(1)
  })

  test('preflight refuses delayed scheduled sends after expiry and records unsent terminal state', async () => {
    const t = setup()
    await destination(t)
    const group = await enqueue(t, 'delayed', { maxAgeMs: 1000 })
    await tick(t)
    const attempt = required(await current(t))
    jest.setSystemTime(START + 1000)
    const expiredRequest = await t.query(internal.request.readRequest, { attemptId: attempt._id })
    expect(expiredRequest).toEqual({
      skipped: 'expired',
    })
    await t.action(internal.request.execute, { attemptId: attempt._id })
    await tick(t)
    const expiredTask = await task(t, group)
    expect(expiredTask.status).toBe('expired')
  })

  test('429 waits globally without yielding group ownership, then retries the same message', async () => {
    const t = setup()
    await destination(t)
    await destination(t, 'second')
    const first = await enqueue(t, 'rate-limited', { messageCount: 2 })
    const next = await enqueue(t, 'other', { destinationKey: 'second', sendAt: START + 1 })
    await tick(t)
    const original = await settle(t, 429, { retryAfterMs: 2500 })
    jest.setSystemTime(START + 2499)
    await tick(t)
    const duringCooldown = await current(t)
    expect(duringCooldown).toBeNull()
    const waitingTask = await task(t, next)
    expect(waitingTask.status).toBe('queued')
    jest.setSystemTime(START + 2500)
    await tick(t)
    const retriedAttempt = await current(t)
    expect(retriedAttempt).toMatchObject({
      groupId: first,
      messageId: original.messageId,
      number: 2,
    })
    await settle(t)
    await tick(t)
    const nextMessageAttempt = await current(t)
    expect(nextMessageAttempt?.groupId).toBe(first)
  })

  test('successful exhausted-bucket response delays the next group globally', async () => {
    const t = setup()
    await destination(t)
    await enqueue(t, 'first')
    const next = await enqueue(t, 'next', { sendAt: START + 1 })
    await tick(t)
    await settle(t, 200, { retryAfterMs: 3000 })
    jest.setSystemTime(START + 1000)
    await tick(t)
    const duringCooldown = await current(t)
    expect(duringCooldown).toBeNull()
    jest.setSystemTime(START + 3000)
    await tick(t)
    const nextGroupAttempt = await current(t)
    expect(nextGroupAttempt?.groupId).toBe(next)
  })

  test('long cooldowns use bounded sleeps without allowing early delivery', async () => {
    const t = setup()
    await destination(t)
    const day = 24 * 60 * 60 * 1000
    await enqueue(t, 'long-cooldown')
    const next = await enqueue(t, 'after-cooldown', { sendAt: START + 1 })
    await tick(t)
    await settle(t, 200, { retryAfterMs: 10 * day })
    expect(await t.query(internal.worker.getBatch, { name: 'delivery' })).toMatchObject({
      kind: 'idle',
      timeoutMs: day,
    })
    jest.setSystemTime(START + day)
    await tick(t)
    expect(await current(t)).toBeNull()
    expect(await t.query(internal.worker.getBatch, { name: 'delivery' })).toMatchObject({
      kind: 'idle',
      timeoutMs: day,
    })
    jest.setSystemTime(START + 10 * day)
    await tick(t)
    const nextAttempt = await current(t)
    expect(nextAttempt?.groupId).toBe(next)
  })

  test('confirmed acceptance with a lost body advances without retrying the send', async () => {
    const t = setup()
    await destination(t)
    const groupId = await enqueue(t, 'accepted-no-body', { messageCount: 2 })
    await tick(t)
    const first = required(await current(t))
    await t.mutation(internal.worker.recordResult, {
      attemptId: first._id,
      response: {
        body: '',
        error: 'Response body unavailable: connection lost',
        headers: {},
        status: 200,
      },
    })
    await tick(t)
    expect(await task(t, groupId)).toMatchObject({ cursor: 1, status: 'active' })
    await tick(t)
    const nextAttempt = await current(t)
    expect(nextAttempt?.messageId).not.toBe(first.messageId)
    const messages = await t.query(api.api.listMessages, { groupId })
    expect(messages[0]).toMatchObject({
      result: { response: { status: 200 } },
      status: 'sent',
    })
    await rejects(
      t.mutation(api.api.manageMessage, {
        key: 'no-receipt',
        messageId: first.messageId,
        operation: 'get',
        sendAt: START,
      }),
      /No confirmed Discord message receipt/,
    )
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
    const currentAfterStaleResult = await current(t)
    expect(currentAfterStaleResult?._id).toBe(next._id)
    await settle(t)
    await t.mutation(internal.worker.recordResult, {
      attemptId: next._id,
      response: { body: '', headers: {}, status: 500 },
    })
    const completedTask = await task(t, group)
    expect(completedTask).toMatchObject({ cursor: 1, status: 'succeeded' })
    const attemptHistory = await t.query(api.api.listAttempts, { messageId: old.messageId })
    expect(attemptHistory).toHaveLength(2)
  })

  test('pending and in-progress actions remain exclusive, but success without completion recovers', async () => {
    const t = setup()
    await destination(t)
    await enqueue(t, 'scheduler-states')
    await tick(t)
    const attempt = required(await current(t))
    jest.setSystemTime(START + 600_000)
    await tick(t)
    const pendingAttempt = await current(t)
    expect(pendingAttempt?._id).toBe(attempt._id)
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
        const runningAttempt = await current(t)
        expect(runningAttempt?._id).toBe(attempt._id)
      }
    }
    const afterRecovery = await current(t)
    expect(afterRecovery).toBeNull()
    const history = await t.query(api.api.listAttempts, { messageId: attempt.messageId })
    expect(history[0]?.result?.response.error).toContain('success')
    expect(history[0]?.result?.recovered).toBe(true)
  })

  test('dedupe rejects changed content and scopes identity to destination and intended time', async () => {
    const t = setup()
    await destination(t)
    await destination(t, 'second')
    const original = await enqueue(t, 'repeat')
    const duplicateGroup = await enqueue(t, 'repeat')
    expect(duplicateGroup).toBe(original)
    const differentTimeGroup = await enqueue(t, 'repeat', { sendAt: START + 1 })
    expect(differentTimeGroup).not.toBe(original)
    const differentDestinationGroup = await enqueue(t, 'repeat', { destinationKey: 'second' })
    expect(differentDestinationGroup).not.toBe(original)
    await rejects(enqueue(t, 'repeat', { messageCount: 2 }), /different content/)
    const groups = await t.query(api.api.listGroups, {})
    expect(groups).toHaveLength(3)
  })

  test('permanent send failure terminates the group and prevents retries against a disabled destination', async () => {
    const t = setup()
    await destination(t)
    const bad = await enqueue(t, 'bad', { messageCount: 3 })
    const next = await enqueue(t, 'next')
    await tick(t)
    await settle(t, 404)
    await tick(t)
    const failedTask = await task(t, bad)
    expect(failedTask).toMatchObject({ cursor: 0, status: 'failed' })
    const disabledDestinationTask = await task(t, next)
    expect(disabledDestinationTask).toMatchObject({
      reason: 'Destination disabled: HTTP 404',
      status: 'failed',
    })
    const attempts = await t.query(api.api.listAttempts, {})
    expect(attempts).toHaveLength(1)
  })

  test('maxAttempts bounds transient failures and retains every response', async () => {
    const t = setup()
    await destination(t)
    const group = await enqueue(t, 'exhaust', { maxAttempts: 2, messageCount: 2 })
    await tick(t)
    await settle(t, 503)
    jest.setSystemTime(START + 1000)
    await tick(t)
    await settle(t, 503)
    const exhaustedTask = await task(t, group)
    expect(exhaustedTask).toMatchObject({ attemptsUsed: 2, cursor: 0, status: 'failed' })
    const attempts = await t.query(api.api.listAttempts, {})
    expect(attempts).toHaveLength(2)
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
    const pausedTask = await task(t, group)
    expect(pausedTask).toMatchObject({ attemptsUsed: 0, status: 'active' })
    await tick(t)
    const whilePaused = await current(t)
    expect(whilePaused).toBeNull()
    await t.mutation(api.api.setPaused, { paused: false })
    await tick(t)
    const resumedAttempt = await current(t)
    expect(resumedAttempt?.number).toBe(1)
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
    const editRequest = await t.query(internal.request.readRequest, { attemptId: active._id })
    expect(editRequest).toMatchObject({
      operation: 'edit',
      payload: '{"content":"corrected"}',
      url: 'https://example.test/webhook/first',
    })
    await settle(t)
    const editedTask = await task(t, edit)
    expect(editedTask.status).toBe('succeeded')
    const retainedOriginal = await t.query(api.api.getMessage, { messageId: original.message._id })
    expect(retainedOriginal).toEqual(original)
    const deletion = await t.mutation(api.api.manageMessage, {
      key: 'delete',
      messageId: original.message._id,
      operation: 'delete',
      sendAt: START,
    })
    await tick(t)
    await settle(t, 404)
    const failedDeletion = await task(t, deletion)
    expect(failedDeletion.status).toBe('failed')
    const destinations = await t.query(api.api.listDestinations, {})
    expect(destinations[0]).not.toHaveProperty('disabledReason')
  })

  test('an expired group forwards one terminal report, and a failed report cannot recurse', async () => {
    const t = setup()
    await destination(t)
    await destination(t, 'sink')
    const expired = await enqueue(t, 'expired', {
      deadLetterDestinationKey: 'sink',
      maxAgeMs: 10,
      messageCount: 2,
      sendAt: START - 1000,
    })
    await tick(t)
    const expiredTask = await task(t, expired)
    expect(expiredTask.status).toBe('expired')
    const groups = await t.query(api.api.listGroups, {})
    expect(groups).toHaveLength(2)
    const report = required(groups.find((view) => view.group.destinationKey === 'sink'))
    expect(report.group.deadLetterDestinationKey).toBeUndefined()
    await tick(t)
    await settle(t, 400)
    const failedReport = await task(t, report.group._id)
    expect(failedReport.status).toBe('failed')
    const groupsAfterReportFailure = await t.query(api.api.listGroups, {})
    expect(groupsAfterReportFailure).toHaveLength(2)
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
      const first = await enqueue(t, 'scheduler-first', { messageCount: 2 })
      const second = await enqueue(t, 'scheduler-second', { sendAt: START + 10 })
      await t.finishAllScheduledFunctions(() => {
        jest.runAllTimers()
      })
      expect(requests).toEqual([
        '{"content":"scheduler-first:0"}',
        '{"content":"scheduler-first:1"}',
        '{"content":"scheduler-second:0"}',
      ])
      const firstTask = await task(t, first)
      expect(firstTask.status).toBe('succeeded')
      const secondTask = await task(t, second)
      expect(secondTask.status).toBe('succeeded')
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
      await enqueue(t, `history-${index}`, { sendAt: START - 60_000 })
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
    const groupsAtAttemptTime = await t.query(api.api.listGroups, { from: START, to: START })
    expect(groupsAtAttemptTime).toEqual([])
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

test('forum thread creation receipts route management through the original webhook and returned thread', async () => {
  const t = setup()
  await destination(t)
  const groupId = await t.mutation(api.api.enqueue, {
    destinationKey: 'first',
    key: 'forum',
    messages: [{ key: 'post', payload: '{"content":"hello","thread_name":"Discussion"}' }],
    sendAt: START,
  })
  await tick(t)
  const originalAttempt = required(await current(t))
  await t.mutation(internal.worker.recordResult, {
    attemptId: originalAttempt._id,
    response: {
      body: '{"id":"456","channel_id":"123"}',
      channelId: '123',
      headers: {},
      messageId: '456',
      status: 200,
    },
  })
  await tick(t)
  const originalMessages = await t.query(api.api.listMessages, { groupId })
  const original = required(originalMessages[0])
  await destination(t, 'first', 'https://example.test/rotated')
  for (const operation of ['get', 'edit', 'delete'] as const) {
    await t.mutation(api.api.manageMessage, {
      key: operation,
      messageId: original.message._id,
      operation,
      sendAt: START,
      ...(operation === 'edit' ? { payload: '{"content":"edited"}' } : {}),
    })
    await tick(t)
    const active = required(await current(t))
    expect(await t.query(internal.request.readRequest, { attemptId: active._id })).toMatchObject({
      messageId: '456',
      operation,
      url: 'https://example.test/webhook/first?thread_id=123',
    })
    await settle(t)
  }
  expect(await t.query(api.api.getMessage, { messageId: original.message._id })).toEqual(original)
})

test('management of a created thread requires a confirmed thread receipt', async () => {
  const t = setup()
  await destination(t)
  const groupId = await t.mutation(api.api.enqueue, {
    destinationKey: 'first',
    key: 'forum',
    messages: [{ key: 'post', payload: '{"content":"hello","thread_name":"Discussion"}' }],
    sendAt: START,
  })
  await tick(t)
  await settle(t)
  const originalMessages = await t.query(api.api.listMessages, { groupId })
  const original = required(originalMessages[0])
  await rejects(
    t.mutation(api.api.manageMessage, {
      key: 'get',
      messageId: original.message._id,
      operation: 'get',
      sendAt: START,
    }),
    /No confirmed Discord thread receipt/,
  )
  expect(await t.query(api.api.listGroups, {})).toHaveLength(1)
})

test('keyed history applies the intended-time window before bounding the archive read', async () => {
  const t = setup()
  await destination(t)
  await destination(t, 'second')
  const older = await enqueue(t, 'recurring', { destinationKey: 'second', sendAt: START - 60_000 })
  for (let i = 0; i < 501; i += 1) {
    await enqueue(t, 'recurring', { sendAt: START + i })
  }
  const filter = { from: START - 60_000, key: 'recurring', to: START - 60_000 }
  const groups = await t.query(api.api.listGroups, filter)
  expect(groups.map(({ group }) => group._id)).toEqual([older])
  const page = await t.query(api.history.groups, {
    ...filter,
    paginationOpts: { cursor: null, numItems: 1 },
  })
  expect(page.page.map(({ group }) => group._id)).toEqual([older])
  const destinationFilter = { destinationKey: 'second', key: 'recurring' }
  const destinationGroups = await t.query(api.api.listGroups, destinationFilter)
  expect(destinationGroups.map(({ group }) => group._id)).toEqual([older])
  const destinationPage = await t.query(api.history.groups, {
    ...destinationFilter,
    paginationOpts: { cursor: null, numItems: 1 },
  })
  expect(destinationPage.page.map(({ group }) => group._id)).toEqual([older])
})

test('message and attempt filters apply before page limits', async () => {
  const t = setup()
  await destination(t)
  const groupId = await enqueue(t, 'large', { messageCount: 2 })
  const messages = await t.query(api.api.listMessages, { groupId })
  const second = required(messages[1]).message
  const matchingMessages = await t.query(api.api.listMessages, {
    groupId,
    key: second.key,
    limit: 1,
  })
  expect(matchingMessages.map(({ message }) => message._id)).toEqual([second._id])
  const messagePage = await t.query(api.history.messages, {
    groupId,
    key: second.key,
    paginationOpts: { cursor: null, numItems: 1 },
  })
  expect(messagePage.page.map(({ message }) => message._id)).toEqual([second._id])
  const oldAttempt = await t.run(async (ctx) => {
    const old = await ctx.db.insert('attempts', {
      groupId,
      messageId: second._id,
      number: 1,
      startedAt: START,
    })
    await ctx.db.insert('attempts', {
      groupId,
      messageId: second._id,
      number: 2,
      startedAt: START + 1000,
    })
    return old
  })
  const filter = { from: START, messageId: second._id, to: START }
  const attempts = await t.query(api.api.listAttempts, { ...filter, limit: 1 })
  expect(attempts.map(({ attempt }) => attempt._id)).toEqual([oldAttempt])
  const attemptPage = await t.query(api.history.attempts, {
    ...filter,
    paginationOpts: { cursor: null, numItems: 1 },
  })
  expect(attemptPage.page.map(({ attempt }) => attempt._id)).toEqual([oldAttempt])
})
