import { DiscordAPIError } from '@discordjs/rest'
import { v } from 'convex/values'
import { groupBy } from 'remeda'

import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { createDiscord, ExpiredError, invalidatesWebhook, parseWebhookUrl } from './discord'
import { pool } from './pool'
import { vResult } from './schema'
import { finishJob, invalidateWebhook } from './state'

type ActiveJob = { job: Doc<'jobs'>; nextMessageIndex: number; url: string }

export const load = internalQuery({
  args: {},
  handler: async (ctx): Promise<Id<'jobs'>[][]> => {
    const jobs = await ctx.db
      .query('jobs')
      // oxlint-disable-next-line unicorn/no-useless-undefined -- Convex requires an explicit value to query absent optional fields.
      .withIndex('by_finishedAt', (q) => q.eq('finishedAt', undefined))
      .collect()
    const destinations = await ctx.db.query('webhooks').collect()
    const webhooks = new Map(destinations.map((webhook) => [webhook._id, webhook]))
    const lanes = groupBy(jobs, (job) => {
      const webhook = webhooks.get(job.webhookId)
      // Missing registrations still get a lane: start cancels their jobs normally,
      // without making another destination's work depend on a historical row.
      return webhook ? parseWebhookUrl(webhook.url).resourceKey : job.webhookId
    })

    return Object.values(lanes).map((lane) => lane.map((job) => job._id))
  },
})

export const start = internalMutation({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }): Promise<ActiveJob | null> => {
    const job = await ctx.db.get(jobId)

    if (!job || job.finishedAt !== undefined) {
      return null
    }

    const webhook = await ctx.db.get(job.webhookId)

    if (!webhook || webhook.invalidatedAt !== undefined) {
      await finishJob(ctx, jobId, 'cancelled')
      return null
    }

    const last = await ctx.db
      .query('results')
      .withIndex('by_jobId', (q) => q.eq('jobId', jobId))
      .order('desc')
      .first()

    // This transaction is the job-start boundary. Later webhook invalidation or
    // removal cannot revoke it: only job cancellation/expiry stops active work.
    // An action restart starts unfinished jobs again and rechecks eligibility.
    // Open jobs have a successful prefix; failure receipts and completion commit
    // together. Workpool ownership means there is no claim or persisted cursor.
    return {
      job,
      nextMessageIndex: last
        ? job.messages.findIndex((message) => message.key === last.messageKey) + 1
        : 0,
      url: webhook.url,
    }
  },
})

export const isOpen = internalQuery({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId)
    // Deliberately do not read the webhook here. Invalidation controls job start;
    // cancellation controls an active job. Topic edits affect neither.
    return job !== null && job.finishedAt === undefined
  },
  returns: v.boolean(),
})

export const checkpoint = internalMutation({
  args: {
    isLastMessage: v.boolean(),
    jobId: v.id('jobs'),
    messageKey: v.string(),
    result: vResult,
  },
  handler: async (ctx, { jobId, messageKey, isLastMessage, result }) => {
    await ctx.db.insert('results', { jobId, messageKey, result })

    // A cancelled job can still have an outstanding HTTP request. Keep the actual
    // response, while finishJob preserves whichever terminal outcome committed.
    if (result.kind === 'failed' && invalidatesWebhook(result.error)) {
      const job = await ctx.db.get(jobId)
      const webhook = job ? await ctx.db.get(job.webhookId) : null

      if (webhook) {
        const { route } = parseWebhookUrl(webhook.url)
        const registrations = await ctx.db.query('webhooks').collect()

        // Thread-specific registrations can share credentials. A failure of those
        // credentials invalidates them all; user removal affects only its own row.
        for (const registration of registrations) {
          if (parseWebhookUrl(registration.url).route === route) {
            await invalidateWebhook(ctx, registration._id)
          }
        }
      }
    }

    if (result.kind === 'failed' || isLastMessage) {
      await finishJob(ctx, jobId, result.kind)
    }

    return null
  },
  returns: v.null(),
})

export const expire = internalMutation({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => {
    await finishJob(ctx, jobId, 'expired')
    return null
  },
  returns: v.null(),
})

// Both the cron and manual recovery enter through the same discovery path. An
// expired job still needs a drain to finalize it. No Workpool-ID bookkeeping is
// needed: redundant drains serialize and can safely discover an empty queue.
export const recover = internalMutation({
  args: {},
  handler: async (ctx) => {
    const job = await ctx.db
      .query('jobs')
      // oxlint-disable-next-line unicorn/no-useless-undefined -- Convex requires an explicit value to query absent optional fields.
      .withIndex('by_finishedAt', (q) => q.eq('finishedAt', undefined))
      .first()

    if (job) {
      await pool.enqueueAction(ctx, internal.worker.drain, {})
    }

    return null
  },
  returns: v.null(),
})

export const drain = internalAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    const lanes = await ctx.runQuery(internal.worker.load, {})
    const discord = createDiscord()
    let stopped = false
    const stopAfterProgressFailure = (error: unknown): never => {
      // Unlike an unavailable webhook, inability to record progress affects every
      // lane. Other in-flight sends must still finish and attempt their checkpoint.
      stopped = true
      throw error
    }

    // Workpool owns one drain, but that drain can run different webhooks at once.
    // Within a webhook, complete each job before starting the next. Only submit a
    // message after its predecessor's receipt commits: SDK queues know requests,
    // not our rule that a permanent rejection stops a job's unfinished suffix.
    const outcomes = await Promise.allSettled(
      lanes.map(async (lane) => {
        for (const jobId of lane) {
          if (stopped) {
            return
          }

          const active = await ctx
            .runMutation(internal.worker.start, { jobId })
            .catch(stopAfterProgressFailure)

          if (!active) {
            continue
          }

          const { job, nextMessageIndex, url } = active

          for (const message of job.messages.slice(nextMessageIndex)) {
            if (stopped) {
              return
            }

            const open = await ctx
              .runQuery(internal.worker.isOpen, { jobId })
              .catch(stopAfterProgressFailure)

            if (stopped || !open) {
              break
            }

            if (Date.now() >= job.expiresAt) {
              await ctx
                .runMutation(internal.worker.expire, { jobId: job._id })
                .catch(stopAfterProgressFailure)
              break
            }

            let result: Doc<'results'>['result']

            try {
              const response = await discord.request({
                expiresAt: job.expiresAt,
                operation: message.kind,
                url,
                ...('payload' in message ? { payload: message.payload } : {}),
                ...('messageId' in message ? { messageId: message.messageId } : {}),
                ...('threadId' in message ? { threadId: message.threadId } : {}),
              })
              result = { kind: 'succeeded', response }
            } catch (error) {
              if (error instanceof ExpiredError) {
                await ctx
                  .runMutation(internal.worker.expire, { jobId: job._id })
                  .catch(stopAfterProgressFailure)
                break
              }

              if (!(error instanceof DiscordAPIError)) {
                // SDK has exhausted its own retries, or execution itself failed.
                // Let Workpool retry from receipts; don't mislabel this as a
                // permanent Discord rejection. Only this webhook lane stops;
                // the other lanes finish before the action fails. The recovery
                // cron revisits open jobs even after Workpool retries run out.
                throw error
              }

              // A repeated delete after an ambiguous response has achieved its
              // purpose when Discord says the message no longer exists. Unknown
              // webhook (10015) remains a failure; it is not proof of deletion.
              result =
                message.kind === 'delete' && error.code === 10_008
                  ? { kind: 'succeeded', response: null }
                  : {
                      error: { code: error.code, message: error.message, status: error.status },
                      kind: 'failed',
                    }
            }

            // Keep this outside the HTTP catch: a failed database checkpoint must
            // halt execution, never be interpreted as a Discord message failure.
            await ctx
              .runMutation(internal.worker.checkpoint, {
                isLastMessage: message === job.messages.at(-1),
                jobId: job._id,
                messageKey: message.key,
                result,
              })
              .catch(stopAfterProgressFailure)

            if (result.kind === 'failed') {
              break
            }
          }
        }
      }),
    )

    // Never fail fast while another lane can still send. Await its current request
    // and receipt first, then release the Workpool slot. A runtime termination can
    // still lose an uncheckpointed success; retries can duplicate that message.
    const failure = outcomes.find((outcome) => outcome.status === 'rejected')

    if (failure?.status === 'rejected') {
      throw failure.reason
    }

    // Newly admitted jobs have their own queued drain, so no polling or separate
    // wake/lock table is required. SDK bucket state lasts for this action only.
    return null
  },
  returns: v.null(),
})
