import { v } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import { internalMutation, internalQuery } from '../_generated/server'
import { db } from '../db'

// Re-export types and validators from db module
export {
  SUBSCRIPTIONS_PER_USER_LIMIT,
  vSubscriptionInput,
  type SubscriptionContext,
  type SubscriptionInput,
} from '../db/alerts/discord/subscriptions'

export type ChannelSubscription = Extract<Doc<'alerts_discord_subscriptions'>, { type: 'channel' }>
export type DMSubscription = Extract<Doc<'alerts_discord_subscriptions'>, { type: 'dm' }>

const subs = db.alerts.discord.subscriptions

// * Internal Queries

export const countByUser = internalQuery({
  args: { user_id: v.string() },
  handler: async (ctx, args) => subs.countByUser(ctx, args.user_id),
})

export const list = internalQuery({
  args: {
    context: v.union(
      v.object({ type: v.literal('channel'), channel_id: v.string() }),
      v.object({ type: v.literal('dm'), user_id: v.string() }),
    ),
  },
  handler: async (ctx, args) => subs.listByContext(ctx, args.context),
})

export const getActive = internalQuery({
  args: {},
  handler: async (ctx) => subs.getActive(ctx),
})

// * Internal Mutations

export const create = internalMutation({
  args: { input: subs.vSubscriptionInput },
  handler: async (ctx, args): Promise<Id<'alerts_discord_subscriptions'> | 'limit' | 'exists'> => {
    const { input } = args

    // Check global user limit
    const count = await subs.countByUser(ctx, input.user_id)
    if (count >= subs.SUBSCRIPTIONS_PER_USER_LIMIT) {
      return 'limit'
    }

    // Check for duplicate pattern in context
    const context =
      input.type === 'channel'
        ? { type: 'channel' as const, channel_id: input.channel_id }
        : { type: 'dm' as const, user_id: input.user_id }

    const existing = await subs.findByContextAndPattern(ctx, context, input.pattern)
    if (existing) return 'exists'

    return subs.insert(ctx, input)
  },
})

export const remove = internalMutation({
  args: {
    context: v.union(
      v.object({ type: v.literal('channel'), channel_id: v.string() }),
      v.object({ type: v.literal('dm'), user_id: v.string() }),
    ),
    pattern: v.string(),
  },
  handler: async (ctx, args) => {
    const { context, pattern } = args

    const sub = await subs.findByContextAndPattern(ctx, context, pattern)
    if (!sub) return null

    await subs.softDelete(ctx, sub._id)
    return sub
  },
})
