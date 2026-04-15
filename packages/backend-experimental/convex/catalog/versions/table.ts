import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { catalogScopeTableValidator, catalogSourceValidator } from '../shared'

export const catalogVersionsTable = defineTable({
  scope_table: catalogScopeTableValidator,
  id: v.string(),
  first_seen_at: v.number(),
  source: catalogSourceValidator,
  content_hash: v.string(),
  version: v.number(),
})
  .index('by_scope_table__id__first_seen_at', ['scope_table', 'id', 'first_seen_at'])
  .index('by_content_hash', ['content_hash'])
