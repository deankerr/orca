import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const catalogRegistryTable = defineTable({
  entity_kind: v.string(),
  entity_aspect: v.string(),
  entity_key: v.string(),

  since_at: v.number(),
  source: v.object({
    locator: v.string(),
    storage_id: v.optional(v.string()),
  }),

  content_hash: v.string(),
  sequence: v.number(),
})
  .index('by_entity_kind__entity_aspect__entity_key__since_at', [
    'entity_kind',
    'entity_aspect',
    'entity_key',
    'since_at',
  ])
  .index('by_content_hash', ['content_hash'])
