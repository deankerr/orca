import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { createTableVHelper } from '../../lib/vTable'

export const table = defineTable({
  pattern: v.string(), // "*", "deepseek/*", "*mistral*", "anthropic/claude-4"
  webhook_url: v.string(),
  label: v.string(),
  enabled: v.boolean(),
}).index('by_enabled', ['enabled'])

export const vTable = createTableVHelper('webhook_subscriptions', table.validator)
