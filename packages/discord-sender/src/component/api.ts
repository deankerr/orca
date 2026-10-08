import { zid, zodToConvexFields } from 'convex-helpers/server/zod4'
import { ConvexError, v } from 'convex/values'
import { isDeepEqual, pick, uniqueBy } from 'remeda'
import { z } from 'zod'

import { mutation, query } from './_generated/server'
import { scheduleDrain } from './scheduling'
import schema from './schema'

const zSerializedPayload = z.string().transform((payload) => {
  // Content limits and card construction belong to the caller. Parse enough here
  // to establish a JSON object, preserving its serialized wire body.
  z.record(z.string(), z.unknown()).parse(JSON.parse(payload))
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
  webhookId: zid('webhooks'),
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
    const url = zWebhookUrl.parse(args.url)
    const existing = await ctx.db
      .query('webhooks')
      .withIndex('by_url', (q) => q.eq('url', url))
      .unique()

    return existing?._id ?? (await ctx.db.insert('webhooks', { ...args, url }))
  },
  returns: v.id('webhooks'),
})

export const submitBatch = mutation({
  args: zodToConvexFields(zBatchInput.shape),
  handler: async (ctx, args) => {
    const input = zBatchInput.parse(args)
    const existing = await ctx.db
      .query('jobs')
      .withIndex('by_key', (q) => q.eq('key', input.key))
      .unique()

    if (existing) {
      if (!isDeepEqual(pick(existing, ['expiresAt', 'key', 'messages', 'webhookId']), input)) {
        throw new ConvexError('Batch key already exists with different input')
      }

      return existing._id
    }

    if (!(await ctx.db.get(input.webhookId))) {
      throw new ConvexError('Webhook does not exist')
    }

    // Accepted -> open. A job owns one destination and its ordered payloads.
    // Fan-out is an explicit caller choice; we do not keep a recipient/input layer
    // merely to optimize a duplication that our present workload does not have.
    const now = Date.now()
    const jobId = await ctx.db.insert('jobs', { ...input, availableAt: now, retryCount: 0 })
    await scheduleDrain(ctx, now)
    return jobId
  },
  returns: v.id('jobs'),
})

export const getJob = query({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => await ctx.db.get(jobId),
  returns: v.union(schema.doc('jobs'), v.null()),
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

// Operator recovery after fixing an execution error that exhausted Workpool retries.
// A wake never reopens a terminal job or discards receipts. No mutable "sending"
// status is needed merely to mirror Workpool execution.
export const resume = mutation({
  args: {},
  handler: async (ctx) => {
    await scheduleDrain(ctx, Date.now())
    return null
  },
  returns: v.null(),
})
