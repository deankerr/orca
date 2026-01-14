import { defineTable } from 'convex/server'
import { v, type Infer } from 'convex/values'

import type { Doc, Id } from '../_generated/dataModel'
import { internalMutation, internalQuery } from '../_generated/server'

// Base fields shared by all subscription types
const baseFields = {
  user_id: v.string(),
  pattern: v.string(),
  deleted_at: v.optional(v.number()),
}

// Channel subscription - posts to a server channel
const channelSubscriptionValidator = v.object({
  type: v.literal('channel'),
  guild_id: v.string(),
  channel_id: v.string(),
  ...baseFields,
})

// DM subscription - sends directly to user
const dmSubscriptionValidator = v.object({
  type: v.literal('dm'),
  ...baseFields,
})

// Combined validator for create args
export const subscriptionInputValidator = v.union(
  v.object({
    type: v.literal('channel'),
    guild_id: v.string(),
    channel_id: v.string(),
    user_id: v.string(),
    pattern: v.string(),
  }),
  v.object({
    type: v.literal('dm'),
    user_id: v.string(),
    pattern: v.string(),
  }),
)

export type SubscriptionInput = Infer<typeof subscriptionInputValidator>

export const table = defineTable(v.union(channelSubscriptionValidator, dmSubscriptionValidator))
  .index('by_user_id', ['user_id', 'deleted_at'])
  .index('by_channel_id', ['channel_id', 'deleted_at'])
  .index('by_channel_id_and_pattern', ['channel_id', 'pattern', 'deleted_at'])
  .index('by_user_id_and_pattern', ['user_id', 'pattern', 'deleted_at'])
  .index('by_deleted_at', ['deleted_at'])

export type ChannelSubscription = Extract<Doc<'discord_alert_subscriptions'>, { type: 'channel' }>
export type DMSubscription = Extract<Doc<'discord_alert_subscriptions'>, { type: 'dm' }>

// Global limit per user (all subscription types combined)
export const SUBSCRIPTIONS_PER_USER_LIMIT = 50

// Count all active subscriptions for a user (for limit checking)
export const countByUser = internalQuery({
  args: { user_id: v.string() },
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query('discord_alert_subscriptions')
      .withIndex('by_user_id', (q) => q.eq('user_id', args.user_id).eq('deleted_at', undefined))
      .collect()
    return subs.length
  },
})

// List active subscriptions by context
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
      return ctx.db
        .query('discord_alert_subscriptions')
        .withIndex('by_channel_id', (q) =>
          q.eq('channel_id', context.channel_id).eq('deleted_at', undefined),
        )
        .collect()
    } else {
      const subs = await ctx.db
        .query('discord_alert_subscriptions')
        .withIndex('by_user_id', (q) =>
          q.eq('user_id', context.user_id).eq('deleted_at', undefined),
        )
        .collect()
      return subs.filter((s) => s.type === 'dm')
    }
  },
})

// Create a subscription (returns null if pattern already exists or limit reached)
export const create = internalMutation({
  args: { input: subscriptionInputValidator },
  handler: async (ctx, args): Promise<Id<'discord_alert_subscriptions'> | 'limit' | 'exists'> => {
    const { input } = args

    // Check global user limit
    const count = await ctx.db
      .query('discord_alert_subscriptions')
      .withIndex('by_user_id', (q) => q.eq('user_id', input.user_id).eq('deleted_at', undefined))
      .collect()

    if (count.length >= SUBSCRIPTIONS_PER_USER_LIMIT) {
      return 'limit'
    }

    // Check for duplicate pattern in context
    if (input.type === 'channel') {
      const existing = await ctx.db
        .query('discord_alert_subscriptions')
        .withIndex('by_channel_id_and_pattern', (q) =>
          q
            .eq('channel_id', input.channel_id)
            .eq('pattern', input.pattern)
            .eq('deleted_at', undefined),
        )
        .first()
      if (existing) return 'exists'

      return ctx.db.insert('discord_alert_subscriptions', {
        type: 'channel',
        guild_id: input.guild_id,
        channel_id: input.channel_id,
        user_id: input.user_id,
        pattern: input.pattern,
      })
    } else {
      const existing = await ctx.db
        .query('discord_alert_subscriptions')
        .withIndex('by_user_id_and_pattern', (q) =>
          q.eq('user_id', input.user_id).eq('pattern', input.pattern).eq('deleted_at', undefined),
        )
        .first()
      // Must also be a DM subscription (index includes channel subs by same user)
      if (existing && existing.type === 'dm') return 'exists'

      return ctx.db.insert('discord_alert_subscriptions', {
        type: 'dm',
        user_id: input.user_id,
        pattern: input.pattern,
      })
    }
  },
})

// Remove a subscription by context and pattern
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

    if (context.type === 'channel') {
      const sub = await ctx.db
        .query('discord_alert_subscriptions')
        .withIndex('by_channel_id_and_pattern', (q) =>
          q.eq('channel_id', context.channel_id).eq('pattern', pattern).eq('deleted_at', undefined),
        )
        .first()

      if (!sub) return null
      await ctx.db.patch(sub._id, { deleted_at: Date.now() })
      return sub
    } else {
      const sub = await ctx.db
        .query('discord_alert_subscriptions')
        .withIndex('by_user_id_and_pattern', (q) =>
          q.eq('user_id', context.user_id).eq('pattern', pattern).eq('deleted_at', undefined),
        )
        .first()

      if (!sub || sub.type !== 'dm') return null
      await ctx.db.patch(sub._id, { deleted_at: Date.now() })
      return sub
    }
  },
})

// Get all active subscriptions (for dispatcher)
export const getActive = internalQuery({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query('discord_alert_subscriptions')
      .withIndex('by_deleted_at', (q) => q.eq('deleted_at', undefined))
      .collect()
  },
})
