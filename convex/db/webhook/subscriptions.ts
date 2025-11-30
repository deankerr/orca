import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { internalQuery } from '../../_generated/server'
import { createTableVHelper } from '../../lib/vTable'

export const table = defineTable({
  model_slug: v.string(), // e.g. "anthropic/claude-4"
  webhook_url: v.string(), // Discord webhook URL
  label: v.optional(v.string()), // optional description
  enabled: v.boolean(),
})
  .index('by_model_slug', ['model_slug'])
  .index('by_enabled', ['enabled'])

export const vTable = createTableVHelper('webhook_subscriptions', table.validator)

export const listEnabled = internalQuery({
  args: {},
  returns: v.array(vTable.doc),
  handler: async (ctx) => {
    return await ctx.db
      .query('webhook_subscriptions')
      .withIndex('by_enabled', (q) => q.eq('enabled', true))
      .collect()
  },
})
