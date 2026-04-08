import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import { internalMutation, internalQuery } from '../_generated/server'
import { SUBSCRIPTIONS_PER_USER_LIMIT } from './constants'
import { vSubscriptionInput } from './subscriptions/table'

const TABLE_NAME = 'alerts_discord_subscriptions' as const

export const list = internalQuery({
  args: {
    context: v.union(
      v.object({ type: v.literal('channel'), channel_id: v.string() }),
      v.object({ type: v.literal('dm'), user_id: v.string() }),
    ),
  },
  handler: async (ctx, args) => {
    const { context } = args

    if (context.type === 'channel') {
      const { channel_id } = context
      return ctx.db
        .query(TABLE_NAME)
        .withIndex('by_channel_id', (q) =>
          q.eq('channel_id', channel_id).eq('deleted_at', undefined),
        )
        .collect()
    }

    const { user_id } = context
    const subs = await ctx.db
      .query(TABLE_NAME)
      .withIndex('by_user_id', (q) => q.eq('user_id', user_id).eq('deleted_at', undefined))
      .collect()
    return subs.filter((sub) => sub.type === 'dm')
  },
})

export const getActive = internalQuery({
  args: {},
  handler: async (ctx) =>
    ctx.db
      .query(TABLE_NAME)
      .withIndex('by_deleted_at', (q) => q.eq('deleted_at', undefined))
      .collect(),
})

// * Internal Mutations

export const create = internalMutation({
  args: { input: vSubscriptionInput },
  handler: async (ctx, args): Promise<Id<'alerts_discord_subscriptions'> | 'limit' | 'exists'> => {
    const { input } = args

    // Check global user limit
    const userSubscriptions = await ctx.db
      .query(TABLE_NAME)
      .withIndex('by_user_id', (q) => q.eq('user_id', input.user_id).eq('deleted_at', undefined))
      .take(SUBSCRIPTIONS_PER_USER_LIMIT)

    if (userSubscriptions.length >= SUBSCRIPTIONS_PER_USER_LIMIT) {
      return 'limit'
    }

    // Check for duplicate pattern in context
    const existing =
      input.type === 'channel'
        ? await ctx.db
            .query(TABLE_NAME)
            .withIndex('by_channel_id_and_pattern', (q) =>
              q
                .eq('channel_id', input.channel_id)
                .eq('pattern', input.pattern)
                .eq('deleted_at', undefined),
            )
            .first()
        : await ctx.db
            .query(TABLE_NAME)
            .withIndex('by_user_id_and_pattern', (q) =>
              q
                .eq('user_id', input.user_id)
                .eq('pattern', input.pattern)
                .eq('deleted_at', undefined),
            )
            .first()

    if (existing && (input.type === 'channel' || existing.type === 'dm')) {
      return 'exists'
    }

    return ctx.db.insert(TABLE_NAME, input)
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

    const sub =
      context.type === 'channel'
        ? await ctx.db
            .query(TABLE_NAME)
            .withIndex('by_channel_id_and_pattern', (q) =>
              q
                .eq('channel_id', context.channel_id)
                .eq('pattern', pattern)
                .eq('deleted_at', undefined),
            )
            .first()
        : await ctx.db
            .query(TABLE_NAME)
            .withIndex('by_user_id_and_pattern', (q) =>
              q.eq('user_id', context.user_id).eq('pattern', pattern).eq('deleted_at', undefined),
            )
            .first()
    if (!sub) {
      return null
    }

    if (context.type === 'dm' && sub.type !== 'dm') {
      return null
    }

    await ctx.db.patch(sub._id, { deleted_at: Date.now() })
    return sub
  },
})
