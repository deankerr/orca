import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { createTableVHelper } from '../../../lib/vTable'

export const table = defineTable({
  enabled: v.boolean(), // turn the whole thing on/off

  core_every_hours: v.number(), // models, endpoints, providers   (e.g. 1)
  uptimes_every_hours: v.number(), // uptimes                        (e.g. 6)
  topApps_every_hours: v.optional(v.number()), // top apps per model             (e.g. 24)
  analytics_every_hours: v.optional(v.number()), // analytics                      (e.g. 24)

  // deprecated - kept for backwards compat with existing config rows
  authors_every_hours: v.optional(v.number()),
  apps_every_hours: v.optional(v.number()),

  delay_minutes: v.number(), // fixed offset after the top of the hour
  jitter_minutes: v.number(), // random extra delay
})

export const vTable = createTableVHelper('snapshot_crawl_config', table.validator)
