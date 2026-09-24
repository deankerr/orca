import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

/** Convex table for retained MEP values. */
export const V4_ENTITY_RECORDS_TABLE = 'v4_entityRecords' as const

/** Native MEP kind stored on records and events. */
export const entityKind = v.union(v.literal('model'), v.literal('provider'), v.literal('endpoint'))

/** One complete extracted entity value at an observation time. */
export const entityRecordsTable = defineTable({
  scan_at: v.string(),
  entity_kind: entityKind,
  entity_id: v.string(),
  model_id: v.optional(v.string()),
  provider_id: v.optional(v.string()),
  raw_json: v.string(),
})
  .index('by_entity_kind_and_entity_id_and_scan_at', ['entity_kind', 'entity_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])

/** Row stored in `v4_entityRecords`, before Convex system fields. */
export type EntityRecordRow = Infer<typeof entityRecordsTable.validator>
/** MEP kind. */
export type EntityKind = Infer<typeof entityKind>
