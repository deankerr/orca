import { v } from 'convex/values'

import { catalogSourceValidator } from '../catalog/shared'

export const ingestArgsValidator = {
  items: v.array(v.record(v.string(), v.any())),
  firstSeenAt: v.number(),
  source: catalogSourceValidator,
}

export function createIngestSummary() {
  return {
    processed: 0,
    changed: 0,
    unchanged: 0,
    failed: 0,
  }
}
