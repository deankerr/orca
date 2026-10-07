import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const status = v.union(
  v.literal('queued'),
  v.literal('active'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('expired'),
)
export const operation = v.union(
  v.literal('send'),
  v.literal('get'),
  v.literal('edit'),
  v.literal('delete'),
)
export const responseFields = {
  body: v.string(),
  channelId: v.optional(v.string()),
  error: v.optional(v.string()),
  headers: v.record(v.string(), v.string()),
  messageId: v.optional(v.string()),
  retryAfterMs: v.optional(v.number()),
  skipped: v.optional(v.union(v.literal('expired'), v.literal('paused'))),
  status: v.union(v.number(), v.null()),
}
export const response = v.object(responseFields)
export const destinationFields = {
  disabledReason: v.optional(v.string()),
  key: v.string(),
  name: v.optional(v.string()),
  url: v.string(),
}
export const groupFields = {
  deadLetterDestinationKey: v.optional(v.string()),
  destinationId: v.id('destinations'),
  destinationKey: v.string(),
  expiresAt: v.optional(v.number()),
  key: v.string(),
  maxAttempts: v.number(),
  messageCount: v.number(),
  reference: v.optional(v.string()),
  sendAt: v.number(),
  url: v.string(),
}
export const taskFields = {
  attemptsUsed: v.number(),
  cursor: v.number(),
  finishedAt: v.optional(v.number()),
  groupId: v.id('groups'),
  nextAttemptAt: v.number(),
  reason: v.optional(v.string()),
  sendAt: v.number(),
  status,
}
export const messageFields = {
  groupId: v.id('groups'),
  key: v.string(),
  operation,
  payload: v.optional(v.string()),
  position: v.number(),
  remoteMessageId: v.optional(v.string()),
  sourceMessageId: v.optional(v.id('messages')),
}
export const attemptFields = {
  groupId: v.id('groups'),
  messageId: v.id('messages'),
  number: v.number(),
  scheduledId: v.optional(v.id('_scheduled_functions')),
  startedAt: v.number(),
}
export const resultFields = {
  attemptId: v.id('attempts'),
  completedAt: v.number(),
  groupId: v.id('groups'),
  messageId: v.id('messages'),
  recovered: v.boolean(),
  response,
}
export default defineSchema({
  attempts: defineTable(attemptFields)
    .index('by_message_startedAt', ['messageId', 'startedAt'])
    .index('by_startedAt', ['startedAt']),
  control: defineTable({
    activeAttemptId: v.optional(v.id('attempts')),
    activeTaskId: v.optional(v.id('tasks')),
    cooldownUntil: v.number(),
    key: v.literal('global'),
    paused: v.boolean(),
  }).index('by_key', ['key']),
  destinations: defineTable(destinationFields).index('by_key', ['key']),
  groups: defineTable(groupFields)
    .index('by_destination_sendAt_key', ['destinationKey', 'sendAt', 'key'])
    .index('by_sendAt', ['sendAt'])
    .index('by_key_sendAt', ['key', 'sendAt'])
    .index('by_key_destination_sendAt', ['key', 'destinationKey', 'sendAt']),
  messages: defineTable(messageFields)
    .index('by_group_position', ['groupId', 'position'])
    .index('by_group_key', ['groupId', 'key'])
    .index('by_key', ['key']),
  results: defineTable(resultFields)
    .index('by_attempt', ['attemptId'])
    .index('by_message', ['messageId'])
    .index('by_completedAt', ['completedAt']),
  tasks: defineTable(taskFields)
    .index('by_group', ['groupId'])
    .index('by_status_sendAt', ['status', 'sendAt']),
})
