import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

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

export const vSubscriptionInput = v.union(channelSubscriptionValidator, dmSubscriptionValidator)
export type SubscriptionInput = Infer<typeof vSubscriptionInput>

export const subscriptionsTable = defineTable(vSubscriptionInput)
  .index('by_user_id', ['user_id', 'deleted_at'])
  .index('by_channel_id', ['channel_id', 'deleted_at'])
  .index('by_channel_id_and_pattern', ['channel_id', 'pattern', 'deleted_at'])
  .index('by_user_id_and_pattern', ['user_id', 'pattern', 'deleted_at'])
  .index('by_deleted_at', ['deleted_at'])
