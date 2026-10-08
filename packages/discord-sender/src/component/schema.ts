import { zodToConvex } from 'convex-helpers/server/zod4'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import { zResponse } from './protocol'

export const vResponse = zodToConvex(zResponse)

export default defineSchema({
  jobs: defineTable({
    availableAt: v.number(),
    expiresAt: v.number(),
    finishedAt: v.optional(v.number()),
    key: v.string(),
    messages: v.array(v.object({ key: v.string(), payload: v.string() })),
    outcome: v.optional(v.union(v.literal('succeeded'), v.literal('failed'), v.literal('expired'))),
    // Retry checkpoint for the first unfinished message, not a lifetime attempts
    // metric. Success resets it; transient responses themselves go to logs.
    retryCount: v.number(),
    webhookId: v.id('webhooks'),
  })
    .index('by_key', ['key'])
    .index('by_finishedAt', ['finishedAt']),
  results: defineTable({
    jobId: v.id('jobs'),
    messageKey: v.string(),
    result: v.union(
      v.object({ kind: v.literal('succeeded'), response: vResponse }),
      v.object({ kind: v.literal('failed'), response: vResponse }),
    ),
    // One terminal result per attempted message. The job's immutable array already
    // supplies order and payload. An unsent suffix has no result rows: the job
    // explains why sending stopped.
  }).index('by_jobId', ['jobId']),
  sender: defineTable({
    globalAvailableAt: v.number(),
    // Scheduled mutation, never an action lease. The timer hands execution to
    // Workpool; Workpool alone owns exclusive sending.
    wakeAt: v.optional(v.number()),
    wakeId: v.optional(v.id('_scheduled_functions')),
    // Resource keys exclude routing query parameters: two thread destinations can
    // share a webhook limit. A pruned map keeps gates together without duplicating
    // cooldowns across destination rows at our present volume.
    webhookAvailableAt: v.record(v.string(), v.number()),
  }),
  webhooks: defineTable({
    name: v.optional(v.string()),
    url: v.string(),
  }).index('by_url', ['url']),
})
