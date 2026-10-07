import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const DISCORD_ROUTES_TABLE = 'discord_alert_routes'
export const DISCORD_PREPARATIONS_TABLE = 'discord_alert_preparations'

export const route = v.object({ destinationKey: v.string(), maxAgeMs: v.number() })
export const skippedEvent = v.object({
  event_id: v.string(),
  reason: v.union(v.literal('ineligible'), v.literal('frequent_pricing')),
})

export const discordRoutesTable = defineTable({
  ...route.fields,
  enabled: v.boolean(),
})
  .index('by_destination', ['destinationKey'])
  .index('by_enabled', ['enabled'])

export const preparationState = v.union(
  v.literal('pending'),
  v.literal('failed'),
  v.literal('complete'),
)

/** Input and routing are captured at admission; render failures remain inspectable. */
export const discordPreparationsTable = defineTable({
  scan_at: v.string(),
  event_ids: v.array(v.id('v4_events')),
  routes: v.array(route),
  state: preparationState,
  attempts: v.number(),
  error: v.optional(v.string()),
  completedAt: v.optional(v.number()),
  groupIds: v.optional(v.array(v.string())),
  skippedEvents: v.optional(v.array(skippedEvent)),
})
  .index('by_scan_at', ['scan_at'])
  .index('by_state_scan_at', ['state', 'scan_at'])
