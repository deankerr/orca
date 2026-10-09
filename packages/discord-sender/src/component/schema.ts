import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const vResult = v.union(
  // Discord owns the message shape. Keep its complete JSON, including fields the
  // current SDK does not know yet. A successful DELETE has no response body.
  v.object({
    kind: v.literal('succeeded'),
    response: v.union(v.record(v.string(), v.any()), v.null()),
  }),
  v.object({
    error: v.object({
      code: v.union(v.number(), v.string()),
      message: v.string(),
      status: v.number(),
    }),
    kind: v.literal('failed'),
  }),
)

export default defineSchema({
  jobs: defineTable({
    expiresAt: v.number(),
    finishedAt: v.optional(v.number()),
    key: v.string(),
    messages: v.array(
      v.union(
        v.object({ key: v.string(), kind: v.literal('send'), payload: v.string() }),
        v.object({
          key: v.string(),
          kind: v.literal('edit'),
          messageId: v.string(),
          payload: v.string(),
          threadId: v.optional(v.string()),
        }),
        v.object({
          key: v.string(),
          kind: v.literal('delete'),
          messageId: v.string(),
          threadId: v.optional(v.string()),
        }),
      ),
    ),
    outcome: v.optional(
      v.union(
        v.literal('succeeded'),
        v.literal('failed'),
        v.literal('expired'),
        v.literal('cancelled'),
      ),
    ),
    topic: v.optional(v.string()),
    webhookId: v.id('webhooks'),
  })
    .index('by_key_and_webhookId', ['key', 'webhookId'])
    .index('by_finishedAt', ['finishedAt']),
  results: defineTable({
    jobId: v.id('jobs'),
    messageKey: v.string(),
    result: vResult,
    // Only terminal outcomes are records. A job's unsent suffix has no results;
    // its outcome explains whether a rejection or expiry stopped that suffix.
  }).index('by_jobId', ['jobId']),
  webhooks: defineTable({
    invalidatedAt: v.optional(v.number()),
    name: v.optional(v.string()),
    topics: v.array(v.string()),
    url: v.string(),
  }).index('by_url_and_invalidatedAt', ['url', 'invalidatedAt']),
})
