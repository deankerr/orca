import { zid, zodToConvexFields } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import { isDeepEqual, pick, unique, uniqueBy } from 'remeda'
import { z } from 'zod'

import type { Doc } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import { pool } from './pool'
import schema from './schema'
import { enqueueDelivery } from './worker'

const zJsonObject = z.record(z.string(), z.unknown())

const zSerializedPayload = z.string().transform((payload) => {
  zJsonObject.parse(JSON.parse(payload))
  return payload
})

const zBatchInput = z.object({
  expiresAt: z.number().nonnegative('expiresAt must be a finite timestamp in milliseconds'),
  key: z.string().min(1, 'Batch key must not be empty'),
  messages: z
    .array(z.object({ key: z.string().min(1), payload: zSerializedPayload }))
    .min(1, 'A batch needs at least one message')
    .refine((messages) => uniqueBy(messages, (entry) => entry.key).length === messages.length, {
      message: 'Message keys must be unique within a batch',
    }),
  webhookIds: z.array(zid('webhooks')).refine((ids) => unique(ids).length === ids.length, {
    message: 'Webhook IDs must be unique within a batch',
  }),
})

const zWebhookUrl = z
  .url({ protocol: /^https?$/ })
  .transform((value) => new URL(value))
  .refine((url) => !url.username && !url.password && !url.hash, {
    message: 'Webhook URL must use HTTP(S) without credentials or a fragment',
  })
  .transform((url) => url.toString())

export const registerWebhook = mutation({
  args: { name: v.optional(v.string()), url: v.string() },
  handler: async (ctx, args) => {
    const normalizedUrl = zWebhookUrl.parse(args.url)

    const existing = await ctx.db
      .query('webhooks')
      .withIndex('by_url', (q) => q.eq('url', normalizedUrl))
      .unique()

    if (existing) {
      return existing._id
    }

    return await ctx.db.insert('webhooks', { ...args, url: normalizedUrl })
  },
  returns: v.id('webhooks'),
})

export const submitBatch = mutation({
  args: zodToConvexFields(zBatchInput.shape),
  handler: async (ctx, args) => {
    zBatchInput.parse(args)

    const existing = await ctx.db
      .query('inputs')
      .withIndex('by_key', (q) => q.eq('key', args.key))
      .unique()

    if (existing) {
      if (!isDeepEqual(pick(existing, ['expiresAt', 'key', 'messages', 'webhookIds']), args)) {
        throw new Error('Batch key already exists with different input')
      }

      return existing._id
    }

    for (const webhookId of args.webhookIds) {
      if (!(await ctx.db.get(webhookId))) {
        throw new Error('Webhook does not exist')
      }
    }
    const inputId = await ctx.db.insert('inputs', {
      ...args,
      ...(args.webhookIds.length === 0 ? { finishedAt: Date.now() } : {}),
    })
    for (const webhookId of args.webhookIds) {
      // Persist the execution reference alongside the immutable input in this transaction.
      await enqueueDelivery(ctx, { inputId, webhookId })
    }
    return inputId
  },
  returns: v.id('inputs'),
})

export const getInput = query({
  args: { inputId: v.id('inputs') },
  handler: async (ctx, args) => await ctx.db.get(args.inputId),
  returns: v.union(schema.doc('inputs'), v.null()),
})

export const listDeliveries = query({
  args: { inputId: v.id('inputs'), webhookId: v.optional(v.id('webhooks')) },
  handler: async (ctx, args) =>
    await ctx.db
      .query('deliveries')
      .withIndex('by_input_webhook', (q) => {
        const input = q.eq('inputId', args.inputId)
        return args.webhookId === undefined ? input : input.eq('webhookId', args.webhookId)
      })
      .collect(),
  returns: v.array(schema.doc('deliveries')),
})

// Submission time deliberately differs from source-event time. The host owns source
// provenance; this query answers "what work did the sender accept that morning?".
// Design question: if full payloads become large, return IDs/metadata here and load
// bodies with getInput. For now the bounded result is convenient for agent inspection.
export const listInputs = query({
  args: { from: v.number(), limit: v.optional(v.number()), to: v.number() },
  handler: async (ctx, args) => {
    const { from, to, limit } = z
      .object({
        from: z.number().nonnegative(),
        limit: z.number().int().min(1).max(100).default(25),
        to: z.number().nonnegative(),
      })
      .refine((range) => range.to >= range.from, 'to must be at or after from')
      .parse(args)
    const inputs = await ctx.db
      .query('inputs')
      .withIndex('by_creation_time', (q) => q.gte('_creationTime', from).lt('_creationTime', to))
      .order('desc')
      .take(limit + 1)
    // This is bounded discovery, not a lossless export/pagination API. Surface truncation
    // so an investigating agent knows to narrow its time window instead of assuming completeness.
    return { hasMore: inputs.length > limit, inputs: inputs.slice(0, limit) }
  },
  returns: v.object({ hasMore: v.boolean(), inputs: v.array(schema.doc('inputs')) }),
})

const vRecipientStatus = v.object({
  error: v.optional(v.string()),
  execution: v.optional(
    v.union(
      v.object({ previousAttempts: v.number(), state: v.literal('pending') }),
      v.object({ previousAttempts: v.number(), state: v.literal('running') }),
      v.object({ state: v.literal('finished') }),
    ),
  ),
  nextMessageIndex: v.optional(v.number()),
  scheduledAt: v.optional(v.number()),
  sentCount: v.number(),
  state: v.union(
    v.literal('pending'),
    v.literal('sending'),
    v.literal('waiting'),
    v.literal('succeeded'),
    v.literal('failed'),
    v.literal('expired'),
    v.literal('canceled'),
  ),
  webhookId: v.id('webhooks'),
  workId: v.optional(v.string()),
})

export const getStatus = query({
  args: { inputId: v.id('inputs') },
  handler: async (ctx, { inputId }) => {
    const input = await ctx.db.get(inputId)
    if (!input) {
      return null
    }
    const recipients = await Promise.all(
      input.webhookIds.map(async (webhookId) => {
        const latest = await ctx.db
          .query('deliveries')
          .withIndex('by_input_webhook', (q) => q.eq('inputId', inputId).eq('webhookId', webhookId))
          .order('desc')
          .first()
        // Messages only advance after success, so every index before the latest event
        // is a confirmed prefix. Reading old receipts adds no information to this summary.
        // Revisit this invariant if we add message skipping or out-of-order operator retries.
        const sentCount = latest
          ? latest.messageIndex + (latest.event.kind === 'succeeded' ? 1 : 0)
          : 0
        const workId = latest?.workId
        const execution = workId === undefined ? undefined : await pool.status(ctx, workId)
        // The unsent suffix is implied by this index and the immutable message array.
        // No synthetic failure rows are needed for messages that were never attempted.
        return {
          ...summarizeRecipient(latest, sentCount === input.messages.length, execution?.state),
          execution,
          nextMessageIndex: sentCount < input.messages.length ? sentCount : undefined,
          sentCount,
          webhookId,
          workId,
        }
      }),
    )
    return { finishedAt: input.finishedAt, recipients }
  },
  returns: v.union(
    v.null(),
    v.object({ finishedAt: v.optional(v.number()), recipients: v.array(vRecipientStatus) }),
  ),
})

function summarizeRecipient(
  latest: Doc<'deliveries'> | null,
  allSent: boolean,
  executionState: string | undefined,
): Pick<Infer<typeof vRecipientStatus>, 'state' | 'error' | 'scheduledAt'> {
  // Workpool's finished means execution ended, not that Discord accepted everything.
  // The ledger remains authoritative after Workpool cleans up its completed records.
  const event = latest?.event
  if (event?.kind === 'failed') {
    return {
      error:
        event.error ??
        event.response?.error ??
        (event.response ? `HTTP ${event.response.status}` : undefined),
      state: 'failed',
    }
  }
  if (event?.kind === 'expired' || event?.kind === 'canceled') {
    return { state: event.kind }
  }
  if (allSent) {
    return { state: 'succeeded' }
  }
  if (event?.kind === 'queued' && event.runAt > Date.now()) {
    return { scheduledAt: event.runAt, state: 'waiting' }
  }
  return { state: executionState === 'running' ? 'sending' : 'pending' }
}

// Running cancellation is intentionally deferred. A running action drains its recipient,
// and a retry may enqueue fresh work: canceling its old Workpool ID cannot revoke that.
// The status check and cancellation decision share a transaction with Workpool.
export const cancelPendingDelivery = mutation({
  args: { inputId: v.id('inputs'), webhookId: v.id('webhooks') },
  handler: async (ctx, { inputId, webhookId }) => {
    const latest = await ctx.db
      .query('deliveries')
      .withIndex('by_input_webhook', (q) => q.eq('inputId', inputId).eq('webhookId', webhookId))
      .order('desc')
      .first()
    if (!latest || latest.event.kind !== 'queued') {
      return false
    }
    const status = await pool.status(ctx, latest.workId)
    if (status.state !== 'pending') {
      return false
    }
    // Workpool processes cancellation asynchronously in bounded batches. Record our
    // decision now so begin cannot send if dispatch precedes cancellation processing.
    await ctx.db.insert('deliveries', {
      event: { kind: 'canceled' },
      inputId,
      messageIndex: latest.messageIndex,
      webhookId,
      workId: latest.workId,
    })
    await pool.cancel(ctx, latest.workId)
    return true
  },
  returns: v.boolean(),
})
