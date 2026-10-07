import { defineBatchWorkerValidators } from '@convex-dev/batch-worker'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalMutation, internalQuery } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import { required, enqueueGroup, ensureControl, getControl, getTask, wake } from './queue'
import { response } from './schema'
import type { operation as operationValidator } from './schema'

const validators = defineBatchWorkerValidators({ batch: {} })
const RECOVERY_POLL_MS = 30_000

function alreadyDeleted(
  result: Infer<typeof response>,
  operation: Infer<typeof operationValidator>,
) {
  if (operation !== 'delete' || result.status !== 404) {
    return false
  }
  try {
    const body: unknown = JSON.parse(result.body)
    return typeof body === 'object' && body !== null && 'code' in body && body.code === 10_008
  } catch {
    return false
  }
}
export function classifyResult(
  result: Infer<typeof response>,
  attempt: number,
  operation: Infer<typeof operationValidator> = 'send',
) {
  const success =
    (result.status !== null && result.status >= 200 && result.status < 300) ||
    alreadyDeleted(result, operation)
  const retryable =
    result.status === null ||
    result.status === 429 ||
    (result.status !== null && result.status >= 500)
  return {
    delayMs: Math.max(
      result.retryAfterMs ?? 0,
      success ? 0 : Math.min(60_000, 1000 * 2 ** Math.min(attempt - 1, 6)),
    ),
    retryable,
    success,
  }
}
export const getBatch = internalQuery({
  args: validators.vQueryArgs,
  handler: async (ctx) => {
    const control = await getControl(ctx)
    if (control?.activeAttemptId) {
      const attempt = required(await ctx.db.get(control.activeAttemptId))
      const result = await ctx.db
        .query('results')
        .withIndex('by_attempt', (q) => q.eq('attemptId', attempt._id))
        .unique()
      if (result) {
        return { batch: {}, kind: 'work' as const }
      }
      const scheduled = attempt.scheduledId ? await ctx.db.system.get(attempt.scheduledId) : null
      if (!scheduled || !['pending', 'inProgress'].includes(scheduled.state.kind)) {
        return { batch: {}, kind: 'work' as const }
      }
      return { kind: 'idle' as const, timeoutMs: RECOVERY_POLL_MS }
    }
    if (control?.paused === true) {
      return { kind: 'idle' as const }
    }
    const task = control?.activeTaskId
      ? await ctx.db.get(control.activeTaskId)
      : await ctx.db
          .query('tasks')
          .withIndex('by_status_sendAt', (q) => q.eq('status', 'queued'))
          .first()
    if (!task) {
      return { kind: 'idle' as const }
    }
    const group = required(await ctx.db.get(task.groupId))
    const eligibleAt = Math.min(
      Math.max(task.nextAttemptAt, control?.cooldownUntil ?? 0),
      group.expiresAt ?? Infinity,
    )
    const delay = eligibleAt - Date.now()
    return delay > 0
      ? { kind: 'idle' as const, timeoutMs: delay }
      : { batch: {}, kind: 'work' as const }
  },
  returns: validators.vQueryReturns,
})
async function finish(
  ctx: MutationCtx,
  task: Doc<'tasks'>,
  terminal: 'succeeded' | 'failed' | 'expired',
  reason?: string,
) {
  await ctx.db.patch(task._id, { finishedAt: Date.now(), reason, status: terminal })
  const control = await ensureControl(ctx)
  await ctx.db.patch(control._id, { activeAttemptId: undefined, activeTaskId: undefined })
  const group = required(await ctx.db.get(task.groupId))
  if (terminal !== 'succeeded') {
    console.warn(
      'Discord delivery group terminal',
      JSON.stringify({
        destinationKey: group.destinationKey,
        groupId: group._id,
        reason,
        status: terminal,
      }),
    )
    if (group.deadLetterDestinationKey !== undefined) {
      await enqueueGroup(ctx, {
        destinationKey: group.deadLetterDestinationKey,
        key: `dead-letter:${group._id}`,
        messages: [
          {
            key: 'report',
            operation: 'send',
            payload: JSON.stringify({
              allowed_mentions: { parse: [] },
              // Keep even JSON-escaped summaries below Discord's 2,000-character limit.
              // Complete keys, payloads and reasons remain in the original group archive.
              content: JSON.stringify({
                completedMessages: task.cursor,
                destinationKey: group.destinationKey.slice(0, 64),
                groupId: group._id,
                key: group.key.slice(0, 64),
                reason: reason?.slice(0, 128),
                status: terminal,
                totalMessages: group.messageCount,
              }),
            }),
          },
        ],
        reference: `dead-letter:${group._id}`,
        sendAt: Date.now(),
      })
    }
  }
}
export const run = internalMutation({
  args: validators.vMutationArgs,
  handler: async (ctx) => {
    // Batch Worker can supply a stale query snapshot. Always re-read control and all eligibility here.
    const control = await ensureControl(ctx)
    if (control.activeAttemptId) {
      return await processActiveAttempt(ctx, control)
    }
    if (control.paused) {
      return null
    }
    let task = control.activeTaskId
      ? await ctx.db.get(control.activeTaskId)
      : await ctx.db
          .query('tasks')
          .withIndex('by_status_sendAt', (q) => q.eq('status', 'queued'))
          .first()
    if (!task) {
      return null
    }
    const group = required(await ctx.db.get(task.groupId))
    if (group.expiresAt !== undefined && Date.now() >= group.expiresAt) {
      await finish(ctx, task, 'expired', 'Delivery deadline elapsed')
      return null
    }
    if (Date.now() < Math.max(task.nextAttemptAt, control.cooldownUntil)) {
      return null
    }
    if (task.status === 'queued') {
      await ctx.db.patch(task._id, { status: 'active' })
      await ctx.db.patch(control._id, { activeTaskId: task._id })
      task = { ...task, status: 'active' }
    }
    const message = await ctx.db
      .query('messages')
      .withIndex('by_group_position', (q) =>
        q.eq('groupId', task.groupId).eq('position', task.cursor),
      )
      .unique()
    if (!message) {
      throw new Error('Queue invariant: missing message')
    }
    const destination = required(await ctx.db.get(group.destinationId))
    if (
      message.operation === 'send' &&
      destination.disabledReason !== undefined &&
      destination.url === group.url
    ) {
      await finish(ctx, task, 'failed', `Destination disabled: ${destination.disabledReason}`)
      return null
    }
    const attemptId = await ctx.db.insert('attempts', {
      groupId: group._id,
      messageId: message._id,
      number: task.attemptsUsed + 1,
      startedAt: Date.now(),
    })
    const scheduledId = await ctx.scheduler.runAfter(0, internal.request.execute, { attemptId })
    await ctx.db.patch(attemptId, { scheduledId })
    await ctx.db.patch(task._id, { attemptsUsed: task.attemptsUsed + 1 })
    await ctx.db.patch(control._id, { activeAttemptId: attemptId })
    return null
  },
  returns: validators.vMutationReturns,
})
export const recordResult = internalMutation({
  args: { attemptId: v.id('attempts'), response },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId)
    if (!attempt) {
      throw new Error('Unknown attempt')
    }
    const previous = await ctx.db
      .query('results')
      .withIndex('by_attempt', (q) => q.eq('attemptId', args.attemptId))
      .unique()
    if (previous) {
      return null
    }
    const control = await getControl(ctx)
    // A stale action cannot report on behalf of a later attempt.
    if (control?.activeAttemptId !== args.attemptId) {
      return null
    }
    await ctx.db.insert('results', {
      attemptId: args.attemptId,
      completedAt: Date.now(),
      groupId: attempt.groupId,
      messageId: attempt.messageId,
      recovered: false,
      response: args.response,
    })
    await wake(ctx)
    return null
  },
  returns: v.null(),
})

async function processActiveAttempt(ctx: MutationCtx, control: Doc<'control'>) {
  const attempt = required(await ctx.db.get(required(control.activeAttemptId)))
  const result = await readOrRecoverResult(ctx, attempt)
  if (!result) {
    return null
  }
  const task = await getTask(ctx, attempt.groupId)
  const group = required(await ctx.db.get(task.groupId))
  const message = required(await ctx.db.get(attempt.messageId))
  if (result.response.skipped) {
    await ctx.db.patch(control._id, { activeAttemptId: undefined })
    if (result.response.skipped === 'expired') {
      await finish(ctx, task, 'expired', 'Delivery deadline elapsed before the request started')
      return null
    }
    await ctx.db.patch(task._id, { attemptsUsed: Math.max(0, task.attemptsUsed - 1) })
    return null
  }
  const outcome = classifyResult(result.response, attempt.number, message.operation)
  const cooldownUntil = Math.max(
    control.cooldownUntil,
    result.completedAt + (result.response.retryAfterMs ?? 0),
  )
  await ctx.db.patch(control._id, { activeAttemptId: undefined, cooldownUntil })
  if (outcome.success) {
    const cursor = task.cursor + 1
    await ctx.db.patch(task._id, { attemptsUsed: 0, cursor, nextAttemptAt: Date.now() })
    if (cursor === group.messageCount) {
      await finish(ctx, { ...task, cursor }, 'succeeded')
    }
    return null
  }
  if (message.operation === 'send' && [401, 403, 404].includes(result.response.status ?? 0)) {
    const destination = required(await ctx.db.get(group.destinationId))
    if (destination.url === group.url) {
      await ctx.db.patch(destination._id, { disabledReason: `HTTP ${result.response.status}` })
    }
  }
  if (!outcome.retryable || attempt.number >= group.maxAttempts) {
    await finish(
      ctx,
      task,
      'failed',
      result.response.error ??
        `HTTP ${result.response.status}; ${outcome.retryable ? 'retry budget exhausted' : 'permanent failure'}`,
    )
    return null
  }
  await ctx.db.patch(task._id, { nextAttemptAt: result.completedAt + outcome.delayMs })
  return null
}

async function readOrRecoverResult(ctx: MutationCtx, attempt: Doc<'attempts'>) {
  let result = await ctx.db
    .query('results')
    .withIndex('by_attempt', (q) => q.eq('attemptId', attempt._id))
    .unique()
  if (!result) {
    const scheduled = attempt.scheduledId ? await ctx.db.system.get(attempt.scheduledId) : null
    if (scheduled && ['pending', 'inProgress'].includes(scheduled.state.kind)) {
      return null
    }
    const resultId = await ctx.db.insert('results', {
      attemptId: attempt._id,
      completedAt: Date.now(),
      groupId: attempt.groupId,
      messageId: attempt.messageId,
      recovered: true,
      response: {
        body: '',
        error: `Scheduled request ended without a result (${scheduled?.state.kind ?? 'missing'}); delivery is uncertain`,
        headers: {},
        status: null,
      },
    })
    result = required(await ctx.db.get(resultId))
  }
  return result
}
