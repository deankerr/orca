import { vWorkId } from '@convex-dev/workpool'
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export const vMessage = v.object({ key: v.string(), payload: v.string() })

export const vResponse = v.object({
  body: v.string(),
  channelId: v.optional(v.string()),
  error: v.optional(v.string()),
  headers: v.record(v.string(), v.string()),
  messageId: v.optional(v.string()),
  status: v.union(v.number(), v.null()),
})

export default defineSchema({
  // One recipient delivery spans many immutable ledger entries and may use several
  // Workpool jobs. Rows describe scheduling and attempts, not separate delivered messages.
  deliveries: defineTable({
    claimId: v.optional(v.id('deliveries')),
    event: v.union(
      v.object({ attempt: v.number(), kind: v.literal('queued'), runAt: v.number() }),
      v.object({ attempt: v.number(), kind: v.literal('claimed') }),
      v.object({ kind: v.literal('retrying'), response: vResponse, retryAt: v.number() }),
      v.object({ kind: v.literal('succeeded'), response: vResponse }),
      v.object({
        error: v.optional(v.string()),
        kind: v.literal('failed'),
        response: v.optional(vResponse),
      }),
      v.object({ kind: v.literal('expired') }),
      v.object({ kind: v.literal('canceled') }),
    ),
    inputId: v.id('inputs'),
    messageIndex: v.number(),
    webhookId: v.id('webhooks'),
    // A retry is a new Workpool job. Correlation prevents its predecessor's completion
    // callback from mistaking a scheduled continuation for a finished recipient.
    workId: vWorkId,
  })
    .index('by_input_webhook', ['inputId', 'webhookId'])
    .index('by_claim', ['claimId']),
  inputs: defineTable({
    expiresAt: v.number(),
    finishedAt: v.optional(v.number()),
    key: v.string(),
    messages: v.array(vMessage),
    webhookIds: v.array(v.id('webhooks')),
  }).index('by_key', ['key']),
  webhooks: defineTable({
    name: v.optional(v.string()),
    url: v.string(),
  }).index('by_url', ['url']),
})
