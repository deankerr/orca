import { v } from 'convex/values'

/** Flattened view bag. Nested objects and non-string arrays cannot be stored. */
export const vMetadataRecord = v.record(
  v.string(),
  v.union(v.boolean(), v.number(), v.null(), v.string(), v.array(v.string())),
)

/** Pricing `display_pricing` rows: flat values plus nested object arrays. */
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
