import { zid, zodToConvexFields } from 'convex-helpers/server/zod4'
import { v } from 'convex/values'
import { isDeepEqual, pick, unique, uniqueBy } from 'remeda'
import { z } from 'zod'

import { internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import { pool } from './pool'
import schema from './schema'

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
      // Each callback needs its own recipient context. All enqueues share this transaction.
      await pool.enqueueAction(
        ctx,
        internal.worker.deliver,
        { inputId, webhookId },
        {
          context: { inputId, webhookId },
          onComplete: internal.worker.onComplete,
          retry: false,
        },
      )
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
