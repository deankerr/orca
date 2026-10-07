import { v } from 'convex/values'

import {
  destinationFields,
  groupFields,
  messageFields,
  taskFields,
  attemptFields,
  resultFields,
  status,
} from './schema'

export const destination = v.object({
  _creationTime: v.number(),
  _id: v.string(),
  ...destinationFields,
})
export const group = v.object({
  _creationTime: v.number(),
  _id: v.string(),
  ...groupFields,
  destinationId: v.string(),
})
export const task = v.object({
  _creationTime: v.number(),
  _id: v.string(),
  ...taskFields,
  groupId: v.string(),
})
export const message = v.object({
  _creationTime: v.number(),
  _id: v.string(),
  ...messageFields,
  groupId: v.string(),
  sourceMessageId: v.optional(v.string()),
})
export const attempt = v.object({
  _creationTime: v.number(),
  _id: v.string(),
  ...attemptFields,
  groupId: v.string(),
  messageId: v.string(),
  scheduledId: v.optional(v.string()),
})
export const result = v.object({
  _creationTime: v.number(),
  _id: v.string(),
  ...resultFields,
  attemptId: v.string(),
  groupId: v.string(),
  messageId: v.string(),
})
export const groupView = v.object({ group, task })
export const messageView = v.object({
  message,
  result: v.union(result, v.null()),
  status: v.union(status, v.literal('sent'), v.literal('completed')),
})
export const attemptView = v.object({ attempt, result: v.union(result, v.null()) })
export const listGroupsArgs = {
  destinationKey: v.optional(v.string()),
  from: v.optional(v.number()),
  key: v.optional(v.string()),
  limit: v.optional(v.number()),
  status: v.optional(status),
  to: v.optional(v.number()),
}
export const listMessagesArgs = {
  groupId: v.optional(v.id('groups')),
  key: v.optional(v.string()),
  limit: v.optional(v.number()),
}
export const listAttemptsArgs = {
  from: v.optional(v.number()),
  limit: v.optional(v.number()),
  messageId: v.optional(v.id('messages')),
  to: v.optional(v.number()),
}
