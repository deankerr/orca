import { v } from 'convex/values'

export const ingestSourceValidator = v.object({
  locator: v.string(),
  storageId: v.optional(v.string()),
})

export const ingestArgsValidator = {
  items: v.array(v.record(v.string(), v.any())),
  sinceAt: v.number(),
  source: ingestSourceValidator,
}

export const ingestSummaryValidator = v.object({
  processed: v.number(),
  changed: v.number(),
  unchanged: v.number(),
  failed: v.number(),
})

export function createIngestSummary() {
  return {
    processed: 0,
    changed: 0,
    unchanged: 0,
    failed: 0,
  }
}
