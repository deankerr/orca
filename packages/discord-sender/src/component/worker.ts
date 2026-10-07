import { vOnCompleteArgs } from '@convex-dev/workpool'
import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { internalAction, internalMutation } from './_generated/server'
import schema, { vResponse } from './schema'
import { executeWebhook } from './transport'

const vDeliveryArgs = { inputId: v.id('inputs'), webhookId: v.id('webhooks') }

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

    if (input.finishedAt !== undefined || isTerminal(latest, input.messages.length)) {
      return null
    }

    if (latest?.event.kind === 'claimed') {
      return null
    }

    const messageIndex = latest ? latest.messageIndex + 1 : 0

    if (Date.now() >= input.expiresAt) {
      await ctx.db.insert('deliveries', { ...args, event: { kind: 'expired' }, messageIndex })
      return null
    }

    const claimId = await ctx.db.insert('deliveries', {
      ...args,
      event: { kind: 'claimed' },
      messageIndex,
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
    // The action holds these immutable input fields, avoiding a full payload read per message.
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

    if (args.response === null) {
      await ctx.db.insert('deliveries', {
        ...identity,
        claimId: claim._id,
        event: { kind: 'expired' },
        messageIndex: claim.messageIndex,
      })
      return null
    }

    const succeeded =
      args.response.status !== null && args.response.status >= 200 && args.response.status < 300

    await ctx.db.insert('deliveries', {
      ...identity,
      claimId: claim._id,
      event: { kind: succeeded ? 'succeeded' : 'failed', response: args.response },
      messageIndex: claim.messageIndex,
    })

    const nextIndex = claim.messageIndex + 1

    if (!succeeded || nextIndex === args.messageCount) {
      return null
    }

    if (Date.now() >= args.expiresAt) {
      await ctx.db.insert('deliveries', {
        ...identity,
        event: { kind: 'expired' },
        messageIndex: nextIndex,
      })
      return null
    }

    return await ctx.db.insert('deliveries', {
      ...identity,
      event: { kind: 'claimed' },
      messageIndex: nextIndex,
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
          : await executeWebhook({
              payload: message.payload,
              url: webhook.url,
            })

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
  handler: async (ctx, { context, result }) => {
    const input = await ctx.db.get(context.inputId)

    if (!input || input.finishedAt !== undefined) {
      return null
    }

    if (result.kind !== 'success') {
      const latest = await latestDelivery(ctx, context.inputId, context.webhookId)

      if (!isTerminal(latest, input.messages.length)) {
        let messageIndex = 0

        if (latest) {
          messageIndex = latest.messageIndex + (latest.event.kind === 'claimed' ? 0 : 1)
        }

        await ctx.db.insert('deliveries', {
          ...context,
          messageIndex,
          ...(latest?.event.kind === 'claimed' ? { claimId: latest._id } : {}),
          event: {
            error: result.kind === 'failed' ? result.error : 'Delivery work was canceled',
            kind: 'failed',
          },
        })
      }
    }

    for (const webhookId of input.webhookIds) {
      const latest = await latestDelivery(ctx, input._id, webhookId)

      if (!isTerminal(latest, input.messages.length)) {
        return null
      }
    }
    await ctx.db.patch(input._id, { finishedAt: Date.now() })
    return null
  },
  returns: v.null(),
})
