import { zodToConvexFields } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { isDeepEqual, pick, unique, uniqueBy } from 'remeda'
import { z } from 'zod'

import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import { parseMessagePayload, parseWebhookUrl } from './discord'
import { pool } from './pool'
import schema from './schema'
import * as state from './state'

const zSerializedPayload = z.string().transform((payload) => {
  // Keep the supplied JSON for inspection. Reject values the sender cannot parse
  // before admitting a job; content limits and card construction belong to callers.
  parseMessagePayload(payload)
  return payload
})

const zBatchInput = z.object({
  expiresAt: z.number().nonnegative(),
  key: z.string().min(1, 'Batch key must not be empty'),
  messages: z
    .array(z.object({ key: z.string().min(1), payload: zSerializedPayload }))
    .min(1, 'A batch needs at least one message')
    .refine((messages) => uniqueBy(messages, (entry) => entry.key).length === messages.length, {
      message: 'Message keys must be unique within a batch',
    }),
  topic: z.string().min(1),
})

const zTopics = z.array(z.string().min(1)).transform((topics) => unique(topics))

export const registerWebhook = mutation({
  args: { name: v.optional(v.string()), topics: v.array(v.string()), url: v.string() },
  handler: async (ctx, args) => {
    const { url } = parseWebhookUrl(args.url)
    const topics = zTopics.parse(args.topics)
    const existing = await ctx.db
      .query('webhooks')
      .withIndex('by_url_and_invalidatedAt', (q) =>
        // oxlint-disable-next-line unicorn/no-useless-undefined -- Match registrations that have never been invalidated.
        q.eq('url', url).eq('invalidatedAt', undefined),
      )
      .unique()

    // Registration never edits an existing row. Replacing an invalidated URL
    // creates a new identity; old jobs cannot follow it or become eligible again.
    return existing?._id ?? (await ctx.db.insert('webhooks', { ...args, topics, url }))
  },
  returns: v.id('webhooks'),
})

export const setWebhookTopics = mutation({
  args: { topics: v.array(v.string()), webhookId: v.id('webhooks') },
  handler: async (ctx, { topics, webhookId }) => {
    const webhook = await ctx.db.get(webhookId)

    if (!webhook || webhook.invalidatedAt !== undefined) {
      throw new ConvexError('Webhook is unavailable')
    }

    // Subscription changes select future submissions only. They never inspect,
    // cancel, backfill or reopen jobs that were already admitted.
    await ctx.db.patch(webhookId, { topics: zTopics.parse(topics) })
    return null
  },
  returns: v.null(),
})

export const invalidateWebhook = mutation({
  args: { webhookId: v.id('webhooks') },
  handler: async (ctx, { webhookId }) => {
    await state.invalidateWebhook(ctx, webhookId)
    return null
  },
  returns: v.null(),
})

export const cancelJob = mutation({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => {
    await state.finishJob(ctx, jobId, 'cancelled')
    return null
  },
  returns: v.null(),
})

export const submitBatch = mutation({
  args: zodToConvexFields(zBatchInput.shape),
  handler: async (ctx, args) => {
    const input = zBatchInput.parse(args)
    const webhooks = await ctx.db.query('webhooks').collect()
    const messages = input.messages.map((message) => ({ ...message, kind: 'send' as const }))
    const recipients: { jobId: Id<'jobs'>; webhookId: Id<'webhooks'> }[] = []
    let created = false

    for (const webhook of webhooks) {
      if (!webhook.topics.includes(input.topic)) {
        continue
      }

      const result = await submit(ctx, { ...input, messages, webhookId: webhook._id })

      if (!result) {
        continue
      }

      created ||= result.created
      recipients.push({ jobId: result.jobId, webhookId: webhook._id })
    }

    // One drain for the whole fan-out, committed with its jobs. Repeated identical
    // submissions do not enqueue work; recovery has its own discovery path.
    if (created) {
      await pool.enqueueAction(ctx, internal.worker.drain, {})
    }

    return recipients
  },
  returns: v.array(v.object({ jobId: v.id('jobs'), webhookId: v.id('webhooks') })),
})

/** Edits and deletes use the same ordered, durable delivery path as sends. */
export const editMessage = mutation({
  args: { expiresAt: v.number(), key: v.string(), payload: v.string(), resultId: v.id('results') },
  handler: async (ctx, args) => {
    const target = await messageTarget(ctx, args.resultId)
    return await submitOperation(ctx, {
      expiresAt: args.expiresAt,
      key: args.key,
      messages: [
        {
          key: 'edit',
          kind: 'edit',
          messageId: target.messageId,
          payload: zSerializedPayload.parse(args.payload),
          ...(target.threadId === undefined ? {} : { threadId: target.threadId }),
        },
      ],
      webhookId: target.webhookId,
    })
  },
  returns: v.union(v.id('jobs'), v.null()),
})

export const deleteMessage = mutation({
  args: { expiresAt: v.number(), key: v.string(), resultId: v.id('results') },
  handler: async (ctx, args) => {
    const target = await messageTarget(ctx, args.resultId)
    return await submitOperation(ctx, {
      expiresAt: args.expiresAt,
      key: args.key,
      messages: [
        {
          key: 'delete',
          kind: 'delete',
          messageId: target.messageId,
          ...(target.threadId === undefined ? {} : { threadId: target.threadId }),
        },
      ],
      webhookId: target.webhookId,
    })
  },
  returns: v.union(v.id('jobs'), v.null()),
})

async function messageTarget(ctx: MutationCtx, resultId: Id<'results'>) {
  const receipt = await ctx.db.get(resultId)
  const response = receipt?.result.kind === 'succeeded' ? receipt.result.response : null

  if (!receipt || !response || typeof response.id !== 'string') {
    throw new ConvexError('A successful message receipt is required')
  }

  const job = await ctx.db.get(receipt.jobId)

  if (!job) {
    throw new ConvexError('Receipt job does not exist')
  }

  const source = job.messages.find((message) => message.key === receipt.messageKey)

  if (!source) {
    throw new ConvexError('Receipt message does not exist')
  }

  let threadId = source.kind === 'edit' ? source.threadId : undefined

  if (source.kind === 'send') {
    const payload = z
      .object({ thread_name: z.unknown().optional() })
      .parse(JSON.parse(source.payload))

    if (typeof payload.thread_name === 'string') {
      const webhook = await ctx.db.get(job.webhookId)

      if (webhook && !new URL(webhook.url).searchParams.has('thread_id')) {
        // A forum/media send can create its own thread; later edits must retain
        // that receipt-derived route even though they no longer carry thread_name.
        threadId = z
          .string()
          .regex(/^\d{17,20}$/)
          .parse(response.channel_id)
      }
    }
  }

  // The caller supplies a receipt, never a different destination for its message.
  // Original sends and later edits remain immutable evidence of each operation.
  return { messageId: response.id, threadId, webhookId: job.webhookId }
}

type JobInput = Pick<Doc<'jobs'>, 'key' | 'expiresAt' | 'webhookId' | 'messages' | 'topic'>

async function submitOperation(ctx: MutationCtx, input: JobInput): Promise<Id<'jobs'> | null> {
  z.object({ expiresAt: z.number().nonnegative(), key: z.string().min(1) }).parse(input)
  const result = await submit(ctx, input)

  if (!result) {
    return null
  }

  if (result.created) {
    await pool.enqueueAction(ctx, internal.worker.drain, {})
  }

  return result.jobId
}

async function submit(ctx: MutationCtx, input: JobInput) {
  const webhook = await ctx.db.get(input.webhookId)

  // Losing a destination is an ordinary routing outcome, including direct
  // edit/delete submissions. Skip before dedupe: an unavailable recipient must
  // not turn a batch into an error, even if its historical key has different input.
  if (!webhook || webhook.invalidatedAt !== undefined) {
    return null
  }

  const existing = await ctx.db
    .query('jobs')
    .withIndex('by_key_and_webhookId', (q) =>
      q.eq('key', input.key).eq('webhookId', input.webhookId),
    )
    .unique()

  if (existing) {
    if (
      !isDeepEqual(pick(existing, ['expiresAt', 'key', 'messages', 'webhookId', 'topic']), input)
    ) {
      throw new ConvexError('Job key already exists with different input')
    }
    return { created: false, jobId: existing._id }
  }

  return { created: true, jobId: await ctx.db.insert('jobs', input) }
}

export const getJob = query({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => await ctx.db.get(jobId),
  returns: v.union(schema.doc('jobs'), v.null()),
})

// Include invalidated registrations for inspection; topic admission excludes them.
export const listWebhooks = query({
  args: {},
  handler: async (ctx) => await ctx.db.query('webhooks').collect(),
  returns: v.array(schema.doc('webhooks')),
})

export const listResults = query({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) =>
    await ctx.db
      .query('results')
      .withIndex('by_jobId', (q) => q.eq('jobId', jobId))
      .collect(),
  returns: v.array(schema.doc('results')),
})

// Submission time differs from historical source-event time. The host owns source
// provenance; this answers "what work did the sender accept that morning?".
export const listJobs = query({
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
    const jobs = await ctx.db
      .query('jobs')
      .withIndex('by_creation_time', (q) => q.gte('_creationTime', from).lt('_creationTime', to))
      .order('desc')
      .take(limit + 1)

    // Bounded discovery for agents, not an export API. Surface truncation so callers
    // know to narrow the window rather than assuming a complete history.
    return { hasMore: jobs.length > limit, jobs: jobs.slice(0, limit) }
  },
  returns: v.object({ hasMore: v.boolean(), jobs: v.array(schema.doc('jobs')) }),
})

// Immediate operator recovery uses the same path as the periodic recovery cron.
// A wake never reopens a terminal job or discards receipts. No mutable "sending"
// status is needed merely to mirror Workpool execution.
export const resume = mutation({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.worker.recover, {})
    return null
  },
  returns: v.null(),
})
