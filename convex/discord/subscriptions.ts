import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import { internalMutation, internalQuery } from '../_generated/server'
import { db } from '../db'
import { SUBSCRIPTIONS_PER_USER_LIMIT } from './constants'

// * Internal Queries

export const countByUser = internalQuery({
  args: { user_id: v.string() },
  handler: async (ctx, args) =>
    await db.alerts.discord.subscriptions.countByUser(ctx, args.user_id),
})

export const list = internalQuery({
  args: {
    context: v.union(
      v.object({ type: v.literal('channel'), channel_id: v.string() }),
      v.object({ type: v.literal('dm'), user_id: v.string() }),
    ),
  },
  handler: async (ctx, args) =>
    await db.alerts.discord.subscriptions.listByContext(ctx, args.context),
})

export const getActive = internalQuery({
  args: {},
  handler: async (ctx) => await db.alerts.discord.subscriptions.getActive(ctx),
})

// * Internal Mutations

export const create = internalMutation({
  args: { input: db.alerts.discord.subscriptions.vSubscriptionInput },
  handler: async (ctx, args): Promise<Id<'alerts_discord_subscriptions'> | 'limit' | 'exists'> => {
    const { input } = args

    // Check global user limit
    const count = await db.alerts.discord.subscriptions.countByUser(ctx, input.user_id)
    if (count >= SUBSCRIPTIONS_PER_USER_LIMIT) {
      return 'limit'
    }

    // Check for duplicate pattern in context
    const context =
      input.type === 'channel'
        ? { type: 'channel' as const, channel_id: input.channel_id }
        : { type: 'dm' as const, user_id: input.user_id }

    const existing = await db.alerts.discord.subscriptions.findByContextAndPattern(
      ctx,
      context,
      input.pattern,
    )
    if (existing) return 'exists'

    return db.alerts.discord.subscriptions.insert(ctx, input)
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

    const sub = await db.alerts.discord.subscriptions.findByContextAndPattern(ctx, context, pattern)
    if (!sub) return null

    await db.alerts.discord.subscriptions.softDelete(ctx, sub._id)
    return sub
  },
})
