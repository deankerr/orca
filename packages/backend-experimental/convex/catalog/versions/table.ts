import { defineTable } from 'convex/server'
import { v } from 'convex/values'

import { catalogScopeTableValidator, catalogSourceValidator } from '../shared'

export const catalogVersionsTable = defineTable({
  scopeTable: catalogScopeTableValidator,
  id: v.string(),
  firstSeenAt: v.number(),
  source: catalogSourceValidator,
  contentHash: v.string(),
  version: v.number(),
})
  .index('by_scopeTable__id__firstSeenAt', ['scopeTable', 'id', 'firstSeenAt'])
  .index('by_contentHash', ['contentHash'])
