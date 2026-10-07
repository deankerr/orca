import { vOnCompleteArgs } from '@convex-dev/workpool'
import type { WorkId } from '@convex-dev/workpool'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { internalAction, internalMutation } from './_generated/server'
import { pool } from './pool'
import { bucketReadyAt, retryAt } from './retry'
import schema, { vResponse } from './schema'
import { executeWebhook } from './transport'

const vDeliveryArgs = { inputId: v.id('inputs'), webhookId: v.id('webhooks') }
type DeliveryIdentity = { inputId: Id<'inputs'>; webhookId: Id<'webhooks'> }

/** Enqueue and ledger insertion share the caller's transaction, including delayed resumes. */
export async function enqueueDelivery(
  ctx: MutationCtx,
  args: DeliveryIdentity & { messageIndex?: number; attempt?: number },
  runAt = Date.now(),
): Promise<WorkId> {
  const identity = { inputId: args.inputId, webhookId: args.webhookId }
  const workId = await pool.enqueueAction(ctx, internal.worker.deliver, identity, {
    context: identity,
    onComplete: internal.worker.onComplete,
    // HTTP retry decisions live in the ledger. Automatic whole-action retries could
    // replay an already successful prefix and cannot honor a response-specific delay.
    retry: false,
    runAt,
  })
  await ctx.db.insert('deliveries', {
    ...identity,
    event: { attempt: args.attempt ?? 0, kind: 'queued', runAt },
    messageIndex: args.messageIndex ?? 0,
    workId,
  })
  return workId
}

async function latestDelivery(ctx: MutationCtx, inputId: Id<'inputs'>, webhookId: Id<'webhooks'>) {
  return await ctx.db
    .query('deliveries')
    .withIndex('by_input_webhook', (q) => q.eq('inputId', inputId).eq('webhookId', webhookId))
    .order('desc')
    .first()
}

function isTerminal(delivery: Doc<'deliveries'> | null, messageCount: number) {
  return (
    delivery !== null &&
    (delivery.event.kind === 'failed' ||
      delivery.event.kind === 'expired' ||
      delivery.event.kind === 'canceled' ||
      (delivery.event.kind === 'succeeded' && delivery.messageIndex === messageCount - 1))
  )
}

export const begin = internalMutation({
  args: vDeliveryArgs,
  handler: async (ctx, args) => {
    const input = await ctx.db.get(args.inputId)
    if (!input || !input.webhookIds.includes(args.webhookId)) {
      throw new Error('Delivery does not belong to this input')
    }
    const webhook = await ctx.db.get(args.webhookId)
    if (!webhook) {
      throw new Error('Webhook does not exist')
    }
    const latest = await latestDelivery(ctx, args.inputId, args.webhookId)
    // Workpool owns the job assignment. This atomic queued -> claimed transition
    // also makes an accidental repeated begin harmless without scanning the ledger.
    if (input.finishedAt !== undefined || latest?.event.kind !== 'queued') {
      return null
    }
    const { messageIndex, workId } = latest
    if (Date.now() >= input.expiresAt) {
      await ctx.db.insert('deliveries', {
        ...args,
        event: { kind: 'expired' },
        messageIndex,
        workId,
      })
      return null
    }
    const claimId = await ctx.db.insert('deliveries', {
      ...args,
      event: { attempt: latest.event.attempt, kind: 'claimed' },
      messageIndex,
      workId,
    })
    return { claimId, input, messageIndex, webhook }
  },
  returns: v.union(
    v.object({
      claimId: v.id('deliveries'),
      input: schema.doc('inputs'),
      messageIndex: v.number(),
      webhook: schema.doc('webhooks'),
    }),
    v.null(),
  ),
})

export const completeMessage = internalMutation({
  args: {
    claimId: v.id('deliveries'),
    // These immutable input fields are already cached in the action; avoid reading
    // the complete payload array after each message merely to choose the next index.
    expiresAt: v.number(),
    messageCount: v.number(),
    response: v.union(vResponse, v.null()),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId)
    if (!claim || claim.event.kind !== 'claimed') {
      throw new Error('Message claim does not exist')
    }
    const existing = await ctx.db
      .query('deliveries')
      .withIndex('by_claim', (q) => q.eq('claimId', args.claimId))
      .unique()
    if (existing) {
      return null
    }
    const identity = { inputId: claim.inputId, webhookId: claim.webhookId }
    const outcome = {
      ...identity,
      claimId: claim._id,
      messageIndex: claim.messageIndex,
      workId: claim.workId,
    }
    const now = Date.now()
    if (args.response === null) {
      await ctx.db.insert('deliveries', { ...outcome, event: { kind: 'expired' } })
      return null
    }
    const succeeded =
      args.response.status !== null && args.response.status >= 200 && args.response.status < 300
    const resumeAt = succeeded ? null : retryAt(args.response, claim.event.attempt, now)
    if (resumeAt !== null) {
      // Preserve every HTTP attempt. Scheduling at the deadline when a retry would
      // be too late makes expiry observable then, without making another HTTP call.
      const runAt = Math.min(resumeAt, args.expiresAt)
      await ctx.db.insert('deliveries', {
        ...outcome,
        event: { kind: 'retrying', response: args.response, retryAt: runAt },
      })
      await enqueueDelivery(
        ctx,
        { ...identity, attempt: claim.event.attempt + 1, messageIndex: claim.messageIndex },
        runAt,
      )
      return null
    }
    await ctx.db.insert('deliveries', {
      ...outcome,
      event: { kind: succeeded ? 'succeeded' : 'failed', response: args.response },
    })
    const nextIndex = claim.messageIndex + 1
    if (!succeeded || nextIndex === args.messageCount) {
      return null
    }
    if (now >= args.expiresAt) {
      await ctx.db.insert('deliveries', {
        ...identity,
        event: { kind: 'expired' },
        messageIndex: nextIndex,
        workId: claim.workId,
      })
      return null
    }
    const readyAt = bucketReadyAt(args.response, now)
    if (readyAt !== null) {
      // Release the Workpool slot while Discord's bucket resets. Successful messages
      // are never replayed; the continuation starts at the next ordered message.
      await enqueueDelivery(
        ctx,
        { ...identity, messageIndex: nextIndex },
        Math.min(readyAt, args.expiresAt),
      )
      return null
    }
    return await ctx.db.insert('deliveries', {
      ...identity,
      event: { attempt: 0, kind: 'claimed' },
      messageIndex: nextIndex,
      workId: claim.workId,
    })
  },
  returns: v.union(v.id('deliveries'), v.null()),
})

export const deliver = internalAction({
  args: vDeliveryArgs,
  handler: async (ctx, args): Promise<null> => {
    const started = await ctx.runMutation(internal.worker.begin, args)
    if (started === null) {
      return null
    }
    const { input, webhook } = started
    let claimId: Id<'deliveries'> | null = started.claimId
    let { messageIndex } = started
    while (claimId !== null) {
      const message = input.messages[messageIndex]
      const result =
        Date.now() >= input.expiresAt
          ? null
          : await executeWebhook({ payload: message.payload, url: webhook.url })
      claimId = await ctx.runMutation(internal.worker.completeMessage, {
        claimId,
        expiresAt: input.expiresAt,
        messageCount: input.messages.length,
        response: result,
      })
      messageIndex += 1
    }
    return null
  },
  returns: v.null(),
})

export const onComplete = internalMutation({
  args: vOnCompleteArgs(v.object(vDeliveryArgs), v.null()),
  handler: async (ctx, { context, result, workId }) => {
    const input = await ctx.db.get(context.inputId)
    if (!input || input.finishedAt !== undefined) {
      return null
    }
    const latest = await latestDelivery(ctx, context.inputId, context.webhookId)
    // A continuation may already be queued or even running when its predecessor's
    // callback arrives. Only the current job can supply a missing terminal outcome.
    if (
      latest?.workId === workId &&
      result.kind !== 'success' &&
      !isTerminal(latest, input.messages.length)
    ) {
      await ctx.db.insert('deliveries', {
        ...context,
        messageIndex: latest.messageIndex,
        ...(latest.event.kind === 'claimed' ? { claimId: latest._id } : {}),
        event:
          result.kind === 'canceled'
            ? { kind: 'canceled' }
            : { error: result.error, kind: 'failed' },
        workId,
      })
    }
    // Design question: unexpected action crashes currently stop this recipient.
    // HTTP/network failures use the explicit retry path above. Recovery from runtime
    // interruption can build on Workpool later without inventing a second watchdog.
    for (const webhookId of input.webhookIds) {
      const last = await latestDelivery(ctx, input._id, webhookId)
      if (!isTerminal(last, input.messages.length)) {
        return null
      }
    }
    await ctx.db.patch(input._id, { finishedAt: Date.now() })
    return null
  },
  returns: v.null(),
})
