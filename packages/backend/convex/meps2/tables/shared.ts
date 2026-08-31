import { v } from 'convex/values'

export const vMetadataRecord = v.record(
  v.string(),
  v.union(v.boolean(), v.number(), v.null(), v.string(), v.array(v.string())),
)

// display_pricing rows nest flat object arrays (`tiers`, `scheduleWindows`, …)
export const vNestedMetadataRecord = v.record(
  v.string(),
  v.union(
    v.boolean(),
    v.number(),
    v.null(),
    v.string(),
    v.array(v.string()),
    v.array(vMetadataRecord),
  ),
)
