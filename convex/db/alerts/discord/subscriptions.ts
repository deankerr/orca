import { defineTable } from 'convex/server'
import { v, type Infer } from 'convex/values'

import type { Id } from '../../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'

const TABLE_NAME = 'alerts_discord_subscriptions' as const

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

export const table = defineTable(v.union(channelSubscriptionValidator, dmSubscriptionValidator))
  .index('by_user_id', ['user_id', 'deleted_at'])
  .index('by_channel_id', ['channel_id', 'deleted_at'])
  .index('by_channel_id_and_pattern', ['channel_id', 'pattern', 'deleted_at'])
  .index('by_user_id_and_pattern', ['user_id', 'pattern', 'deleted_at'])
  .index('by_deleted_at', ['deleted_at'])

// Input validator for create operations
export const vSubscriptionInput = v.union(
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

export type SubscriptionInput = Infer<typeof vSubscriptionInput>

// Context for querying/deleting subscriptions
export type SubscriptionContext =
  | { type: 'channel'; channel_id: string }
  | { type: 'dm'; user_id: string }

// Global limit per user (all subscription types combined)
export const SUBSCRIPTIONS_PER_USER_LIMIT = 50

// * Queries

export async function getActive(ctx: QueryCtx) {
  return ctx.db
    .query(TABLE_NAME)
    .withIndex('by_deleted_at', (q) => q.eq('deleted_at', undefined))
    .collect()
}

export async function listByContext(ctx: QueryCtx, context: SubscriptionContext) {
  if (context.type === 'channel') {
    return ctx.db
      .query(TABLE_NAME)
      .withIndex('by_channel_id', (q) =>
        q.eq('channel_id', context.channel_id).eq('deleted_at', undefined),
      )
      .collect()
  } else {
    const subs = await ctx.db
      .query(TABLE_NAME)
      .withIndex('by_user_id', (q) => q.eq('user_id', context.user_id).eq('deleted_at', undefined))
      .collect()
    return subs.filter((s) => s.type === 'dm')
  }
}

export async function countByUser(ctx: QueryCtx, user_id: string) {
  const subs = await ctx.db
    .query(TABLE_NAME)
    .withIndex('by_user_id', (q) => q.eq('user_id', user_id).eq('deleted_at', undefined))
    .collect()
  return subs.length
}

export async function findByContextAndPattern(
  ctx: QueryCtx,
  context: SubscriptionContext,
  pattern: string,
) {
  if (context.type === 'channel') {
    return ctx.db
      .query(TABLE_NAME)
      .withIndex('by_channel_id_and_pattern', (q) =>
        q.eq('channel_id', context.channel_id).eq('pattern', pattern).eq('deleted_at', undefined),
      )
      .first()
  } else {
    const sub = await ctx.db
      .query(TABLE_NAME)
      .withIndex('by_user_id_and_pattern', (q) =>
        q.eq('user_id', context.user_id).eq('pattern', pattern).eq('deleted_at', undefined),
      )
      .first()
    return sub?.type === 'dm' ? sub : null
  }
}

// * Mutations

export async function insert(ctx: MutationCtx, input: SubscriptionInput) {
  if (input.type === 'channel') {
    return ctx.db.insert(TABLE_NAME, {
      type: 'channel',
      guild_id: input.guild_id,
      channel_id: input.channel_id,
      user_id: input.user_id,
      pattern: input.pattern,
    })
  } else {
    return ctx.db.insert(TABLE_NAME, {
      type: 'dm',
      user_id: input.user_id,
      pattern: input.pattern,
    })
  }
}

export async function softDelete(ctx: MutationCtx, id: Id<typeof TABLE_NAME>) {
  return ctx.db.patch(id, { deleted_at: Date.now() })
}
