import type { ObjectType } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { getTask } from './queue'
import type { listGroupsArgs, listMessagesArgs, listAttemptsArgs } from './validators'

// Native bounded reads and component pagination share the same indexed selection.
type Reader = Pick<QueryCtx['db'], 'query'>

export function selectGroups(
  db: Reader,
  {
    key,
    destinationKey,
    from = 0,
    to = Number.MAX_SAFE_INTEGER,
  }: ObjectType<typeof listGroupsArgs>,
) {
  const groups = db.query('groups')
  if (key !== undefined && destinationKey !== undefined) {
    return groups.withIndex('by_key_destination_sendAt', (q) =>
      q.eq('key', key).eq('destinationKey', destinationKey).gte('sendAt', from).lte('sendAt', to),
    )
  }
  if (key !== undefined) {
    return groups.withIndex('by_key_sendAt', (q) =>
      q.eq('key', key).gte('sendAt', from).lte('sendAt', to),
    )
  }
  if (destinationKey !== undefined) {
    return groups.withIndex('by_destination_sendAt_key', (q) =>
      q.eq('destinationKey', destinationKey).gte('sendAt', from).lte('sendAt', to),
    )
  }
  return groups.withIndex('by_sendAt', (q) => q.gte('sendAt', from).lte('sendAt', to))
}

export function selectMessages(db: Reader, { groupId, key }: ObjectType<typeof listMessagesArgs>) {
  const messages = db.query('messages')
  if (groupId !== undefined && key !== undefined) {
    return messages.withIndex('by_group_key', (q) => q.eq('groupId', groupId).eq('key', key))
  }
  if (groupId !== undefined) {
    return messages.withIndex('by_group_position', (q) => q.eq('groupId', groupId))
  }
  if (key !== undefined) {
    return messages.withIndex('by_key', (q) => q.eq('key', key)).order('desc')
  }
  throw new Error('Supply groupId or message key')
}

export function selectAttempts(
  db: Reader,
  { messageId, from = 0, to = Number.MAX_SAFE_INTEGER }: ObjectType<typeof listAttemptsArgs>,
) {
  const attempts = db.query('attempts')
  if (messageId !== undefined) {
    return attempts.withIndex('by_message_startedAt', (q) =>
      q.eq('messageId', messageId).gte('startedAt', from).lte('startedAt', to),
    )
  }
  return attempts.withIndex('by_startedAt', (q) => q.gte('startedAt', from).lte('startedAt', to))
}

export async function viewMessage(ctx: QueryCtx, message: Doc<'messages'>) {
  const task = await getTask(ctx, message.groupId)
  const result = await ctx.db
    .query('results')
    .withIndex('by_message', (q) => q.eq('messageId', message._id))
    .order('desc')
    .first()
  let status: 'sent' | 'completed' | Doc<'tasks'>['status'] = task.status
  if (message.position < task.cursor) {
    status = message.operation === 'send' ? 'sent' : 'completed'
  } else if (message.position > task.cursor && task.status === 'active') {
    status = 'queued'
  }
  return { message, result, status }
}
export async function viewAttempt(ctx: QueryCtx, attempt: Doc<'attempts'>) {
  const result = await ctx.db
    .query('results')
    .withIndex('by_attempt', (q) => q.eq('attemptId', attempt._id))
    .unique()
  return { attempt, result }
}
