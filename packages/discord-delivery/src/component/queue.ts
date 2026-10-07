import { ping } from '@convex-dev/batch-worker'
import type { Infer } from 'convex/values'

import { components, internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { operation } from './schema'

export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('Queue invariant: missing referenced record')
  }
  return value
}
export const MAX_MESSAGES = 500
export async function wake(ctx: MutationCtx) {
  await ping(ctx, components.batchWorker, {
    name: 'delivery',
    workQuery: internal.worker.getBatch,
    workerMutation: internal.worker.run,
  })
}
export async function getControl(ctx: QueryCtx) {
  return await ctx.db
    .query('control')
    .withIndex('by_key', (q) => q.eq('key', 'global'))
    .unique()
}
export async function ensureControl(ctx: MutationCtx) {
  const existing = await getControl(ctx)
  if (existing) {
    return existing
  }
  const id = await ctx.db.insert('control', { cooldownUntil: 0, key: 'global', paused: false })
  return required(await ctx.db.get(id))
}
export async function getTask(ctx: QueryCtx, groupId: Id<'groups'>) {
  const task = await ctx.db
    .query('tasks')
    .withIndex('by_group', (q) => q.eq('groupId', groupId))
    .unique()
  if (!task) {
    throw new Error('Group task not found')
  }
  return task
}
export function boundedLimit(limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error('limit must be between 1 and 500')
  }
  return limit
}
export function checkTimestamp(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0 || value > 8.64e15) {
    throw new Error(`${name} must be a finite epoch millisecond timestamp`)
  }
}
export function validatePayload(payload: string) {
  const value: unknown = JSON.parse(payload)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Payload must be a JSON object')
  }
  if (new TextEncoder().encode(payload).length > 256 * 1024) {
    throw new Error('Payload exceeds 256 KiB')
  }
}
export type NewMessage = {
  key: string
  payload?: string
  operation: Infer<typeof operation>
  remoteMessageId?: string
  sourceMessageId?: Id<'messages'>
}
export type EnqueueOptions = {
  destinationKey: string
  key: string
  sendAt: number
  maxAgeMs?: number
  maxAttempts?: number
  reference?: string
  messages: NewMessage[]
  urlOverride?: string
  deadLetterDestinationKey?: string
}
export async function enqueueGroup(ctx: MutationCtx, args: EnqueueOptions): Promise<Id<'groups'>> {
  const { maxAttempts, expiresAt } = validateOptions(args)
  const destination = await ctx.db
    .query('destinations')
    .withIndex('by_key', (q) => q.eq('key', args.destinationKey))
    .unique()
  if (!destination) {
    throw new Error(`Unknown destination: ${args.destinationKey}`)
  }
  if (args.deadLetterDestinationKey !== undefined) {
    if (args.deadLetterDestinationKey === args.destinationKey) {
      throw new Error('Dead-letter destination must differ from delivery destination')
    }
    const sink = await ctx.db
      .query('destinations')
      .withIndex('by_key', (q) => q.eq('key', required(args.deadLetterDestinationKey)))
      .unique()
    if (!sink) {
      throw new Error('Unknown dead-letter destination')
    }
  }
  const previous = await ctx.db
    .query('groups')
    .withIndex('by_destination_sendAt_key', (q) =>
      q.eq('destinationKey', args.destinationKey).eq('sendAt', args.sendAt).eq('key', args.key),
    )
    .unique()
  if (previous) {
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_group_position', (q) => q.eq('groupId', previous._id))
      .take(MAX_MESSAGES)
    assertDuplicate(previous, messages, args, maxAttempts, expiresAt)
    return previous._id
  }
  const groupId = await ctx.db.insert('groups', {
    deadLetterDestinationKey: args.deadLetterDestinationKey,
    destinationId: destination._id,
    destinationKey: destination.key,
    expiresAt,
    key: args.key,
    maxAttempts,
    messageCount: args.messages.length,
    reference: args.reference,
    sendAt: args.sendAt,
    url: args.urlOverride ?? destination.url,
  })
  for (const [position, message] of args.messages.entries()) {
    await ctx.db.insert('messages', { groupId, position, ...message })
  }
  await ctx.db.insert('tasks', {
    attemptsUsed: 0,
    cursor: 0,
    groupId,
    nextAttemptAt: args.sendAt,
    sendAt: args.sendAt,
    status: 'queued',
  })
  await ensureControl(ctx)
  await wake(ctx)
  return groupId
}

function validateOptions(args: EnqueueOptions) {
  checkTimestamp(args.sendAt, 'sendAt')
  if (args.maxAgeMs !== undefined && (!Number.isFinite(args.maxAgeMs) || args.maxAgeMs < 0)) {
    throw new Error('maxAgeMs must be nonnegative and finite')
  }
  const maxAttempts = args.maxAttempts ?? 8
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 100) {
    throw new Error('maxAttempts must be between 1 and 100')
  }
  if (args.key === undefined || args.messages.length < 1 || args.messages.length > MAX_MESSAGES) {
    throw new Error('A keyed group must contain 1–500 messages')
  }
  if (
    new Set(args.messages.map((m) => m.key)).size !== args.messages.length ||
    args.messages.some((m) => !m.key)
  ) {
    throw new Error('Message keys must be nonempty and unique within a group')
  }
  let bytes = 0
  for (const message of args.messages) {
    if (message.payload !== undefined) {
      validatePayload(message.payload)
      bytes += new TextEncoder().encode(message.payload).length
    }
  }
  if (bytes > 4 * 1024 * 1024) {
    throw new Error('Group payloads exceed 4 MiB')
  }
  const expiresAt = args.maxAgeMs === undefined ? undefined : args.sendAt + args.maxAgeMs
  if (expiresAt !== undefined) {
    checkTimestamp(expiresAt, 'expiresAt')
  }
  return { expiresAt, maxAttempts }
}

function assertDuplicate(
  previous: Doc<'groups'>,
  messages: Doc<'messages'>[],
  args: EnqueueOptions,
  maxAttempts: number,
  expiresAt: number | undefined,
) {
  const sameMessages =
    messages.length === args.messages.length &&
    messages.every((message, i) => {
      const expected = args.messages[i]
      return (
        message.key === expected.key &&
        message.payload === expected.payload &&
        message.operation === expected.operation &&
        message.remoteMessageId === expected.remoteMessageId &&
        message.sourceMessageId === expected.sourceMessageId
      )
    })
  if (
    !sameMessages ||
    previous.expiresAt !== expiresAt ||
    previous.maxAttempts !== maxAttempts ||
    previous.reference !== args.reference ||
    previous.deadLetterDestinationKey !== args.deadLetterDestinationKey ||
    (args.urlOverride !== undefined && previous.url !== args.urlOverride)
  ) {
    throw new Error('Dedupe identity already exists with different content')
  }
}
