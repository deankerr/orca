import { ConvexError, v } from 'convex/values'
import { pickBy } from 'remeda'

import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalAction, internalMutation, internalQuery } from './_generated/server'
import { classifyResponse, webhookResourceKey } from './retry'
import type { Cooldown } from './retry'
import { vResponse } from './schema'
import { executeWebhook } from './transport'

type Gates = Pick<Doc<'sender'>, 'globalAvailableAt' | 'webhookAvailableAt'>
type Decision = ReturnType<typeof classifyResponse>

type ActiveJob = {
  job: Doc<'jobs'>
  nextMessageIndex: number
  resourceKey: string
  url: string
}

type DrainState = { gates: Gates; jobs: ActiveJob[] }

export const load = internalQuery({
  args: {},
  handler: async (ctx): Promise<DrainState | null> => {
    const jobs = await ctx.db
      .query('jobs')
      // oxlint-disable-next-line unicorn/no-useless-undefined -- Convex requires an explicit value to query absent optional fields.
      .withIndex('by_finishedAt', (q) => q.eq('finishedAt', undefined))
      .collect()

    if (jobs.length === 0) {
      return null
    }

    const sender = await ctx.db.query('sender').unique()

    if (!sender) {
      throw new ConvexError('Open jobs require sender state')
    }

    const destinations = await ctx.db.query('webhooks').collect()
    const webhooks = new Map(destinations.map((webhook) => [webhook._id, webhook]))
    const activeJobs = await Promise.all(
      jobs.map(async (job): Promise<ActiveJob> => {
        const webhook = webhooks.get(job.webhookId)

        if (!webhook) {
          throw new ConvexError('Job webhook does not exist')
        }

        const last = await ctx.db
          .query('results')
          .withIndex('by_jobId', (q) => q.eq('jobId', job._id))
          .order('desc')
          .first()

        // Open jobs can only have a successful prefix: a failed result and job
        // finalization commit together. Its last key locates the next message in
        // the immutable array. No stored cursor, position or receipt scan is needed.
        const nextMessageIndex = last
          ? job.messages.findIndex((message) => message.key === last.messageKey) + 1
          : 0

        return {
          job,
          nextMessageIndex,
          resourceKey: webhookResourceKey(webhook.url),
          url: webhook.url,
        }
      }),
    )

    return {
      gates: {
        globalAvailableAt: sender.globalAvailableAt,
        webhookAvailableAt: sender.webhookAvailableAt,
      },
      jobs: activeJobs,
    }
  },
})

function applyCooldowns(
  gates: Gates,
  resourceKey: string,
  cooldowns: Cooldown[],
  now: number,
): Gates {
  const updated = {
    globalAvailableAt: gates.globalAvailableAt,
    webhookAvailableAt: pickBy(gates.webhookAvailableAt, (at) => at > now),
  }

  for (const cooldown of cooldowns) {
    if (cooldown.scope === 'global') {
      updated.globalAvailableAt = Math.max(updated.globalAvailableAt, cooldown.availableAt)
    } else {
      updated.webhookAvailableAt[resourceKey] = Math.max(
        updated.webhookAvailableAt[resourceKey] ?? 0,
        cooldown.availableAt,
      )
    }
  }

  return updated
}

export const checkpoint = internalMutation({
  args: {
    isLastMessage: v.boolean(),
    jobId: v.id('jobs'),
    messageKey: v.string(),
    resourceKey: v.string(),
    response: vResponse,
    retryCount: v.number(),
  },
  handler: async (ctx, args): Promise<Decision> => {
    const now = Date.now()
    const decision = classifyResponse(args.response, args.retryCount, now)

    if (decision.cooldowns.length > 0) {
      const sender = await ctx.db.query('sender').unique()

      if (!sender) {
        throw new ConvexError('A response requires sender state')
      }

      await ctx.db.patch(
        sender._id,
        applyCooldowns(sender, args.resourceKey, decision.cooldowns, now),
      )
    }

    // The action is the only writer of delivery progress. Its immutable job data
    // and current retry count are already loaded; rereading payloads or acquiring
    // a per-message claim here would add no protection under Workpool concurrency 1.
    if (decision.kind === 'retry') {
      await ctx.db.patch(args.jobId, {
        availableAt: decision.retryAt,
        retryCount: args.retryCount + 1,
      })
      console.warn('Discord message will retry', {
        jobId: args.jobId,
        messageKey: args.messageKey,
        response: args.response,
        retryAt: decision.retryAt,
        retryCount: args.retryCount + 1,
      })
      return decision
    }

    // Attempt -> terminal message result. Persist the receipt and any job finish
    // atomically, so a restarted action cannot resend an acknowledged prefix.
    // Expiry never changes the meaning of a response to a request already begun.
    await ctx.db.insert('results', {
      jobId: args.jobId,
      messageKey: args.messageKey,
      result: { kind: decision.kind, response: args.response },
    })
    const finished = decision.kind === 'failed' || args.isLastMessage

    if (finished) {
      await ctx.db.patch(args.jobId, { finishedAt: now, outcome: decision.kind, retryCount: 0 })
    } else if (args.retryCount > 0) {
      await ctx.db.patch(args.jobId, { retryCount: 0 })
    }

    // A successful attempt already passed availableAt, so that timestamp needs no
    // update. Ordinary nonfinal success only inserts its result; the job's payload
    // document stays untouched until a retry checkpoint or finalization needs it.
    return decision
  },
})

export const expire = internalMutation({
  args: { jobId: v.id('jobs') },
  handler: async (ctx, { jobId }) => {
    // Open -> expired happens before attempting a message. There is no response
    // to attach and no synthetic task result for the unsent suffix.
    await ctx.db.patch(jobId, { finishedAt: Date.now(), outcome: 'expired', retryCount: 0 })
    return null
  },
  returns: v.null(),
})

function availableAt(active: ActiveJob, gates: Gates): number {
  return Math.max(
    active.job.availableAt,
    gates.globalAvailableAt,
    gates.webhookAvailableAt[active.resourceKey] ?? 0,
  )
}

// Give a busy drain a generous margin before the action runtime limit. Ordinary
// cooldowns never consume this budget sleeping: the action releases its slot.
const DRAIN_BUDGET_MS = 25 * 60 * 1000

export const drain = internalAction({
  args: {},
  handler: async (ctx): Promise<null> => {
    const state = await ctx.runQuery(internal.worker.load, {})

    if (!state) {
      return null
    }

    const { jobs } = state
    let { gates } = state
    let current: ActiveJob | undefined
    const yieldAt = Date.now() + DRAIN_BUDGET_MS

    // Workpool admits only one drain. Jobs submitted while it runs will schedule
    // another drain, so this snapshot needs no polling or second running flag.
    // Keep a selected job until it finishes or must wait; then take the oldest
    // eligible job. Cooldowns may therefore interleave jobs, never message order.
    while (jobs.length > 0) {
      const now = Date.now()
      const currentGates = gates
      const expired = jobs.find((active) => active.job.expiresAt <= now)

      if (expired) {
        await ctx.runMutation(internal.worker.expire, { jobId: expired.job._id })
        jobs.splice(jobs.indexOf(expired), 1)

        if (current === expired) {
          current = undefined
        }

        continue
      }

      if (current && availableAt(current, gates) > now) {
        current = undefined
      }

      current ??= jobs.find((active) => availableAt(active, currentGates) <= now)

      if (!current || now >= yieldAt) {
        // All waiting -> put down work. Wake for the first useful send OR expiry;
        // otherwise a long Retry-After would leave expired jobs appearing open.
        const runAt = current
          ? now
          : Math.min(
              ...jobs.map((active) =>
                Math.min(availableAt(active, currentGates), active.job.expiresAt),
              ),
            )
        await ctx.runMutation(internal.scheduling.schedule, { runAt })
        return null
      }

      // Ready -> attempt. Expiry was checked above, immediately before this path,
      // with no intervening await. We deliberately write nothing before HTTP.
      const message = current.job.messages[current.nextMessageIndex]
      const response = await executeWebhook({ payload: message.payload, url: current.url })
      const isLastMessage = current.nextMessageIndex === current.job.messages.length - 1
      const decision = await ctx.runMutation(internal.worker.checkpoint, {
        isLastMessage,
        jobId: current.job._id,
        messageKey: message.key,
        resourceKey: current.resourceKey,
        response,
        retryCount: current.job.retryCount,
      })

      // Advance memory only after the durable checkpoint. A crash before that
      // checkpoint retries this message; a crash after it derives the new prefix.
      // No transient response or attempt history becomes persistent task state.
      gates = applyCooldowns(gates, current.resourceKey, decision.cooldowns, Date.now())

      if (decision.kind === 'retry') {
        current.job.availableAt = decision.retryAt
        current.job.retryCount += 1
        current = undefined
      } else if (decision.kind === 'failed' || isLastMessage) {
        jobs.splice(jobs.indexOf(current), 1)
        current = undefined
      } else {
        current.nextMessageIndex += 1
        current.job.retryCount = 0
      }
    }

    return null
  },
  returns: v.null(),
})
