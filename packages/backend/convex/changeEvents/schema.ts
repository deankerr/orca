import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import { z } from 'zod'

import { scanIngestionsTable } from '../v3/ingestions.table'

export const CHANGE_EVENTS_TABLE = 'changeEvents' as const
export const CHANGE_EVENT_INPUTS_TABLE = 'changeEventInputs' as const
export const CHANGE_EVENT_INGESTIONS_TABLE = 'changeEventIngestions' as const

/** Temporary production-prototype ingestion history, independent of the views cursor. */
export const changeEventIngestionsTable = defineTable(scanIngestionsTable.validator).index(
  'by_to_artifact_id',
  ['to_artifact_id'],
)

const record = z.record(z.string(), z.json())
const recordPair = z.object({ before: record.nullable(), after: record.nullable() })

const entityContext = z.object({
  entity: record.nullable(),
  model: record.nullable().optional(),
  provider: record.nullable().optional(),
})

const context = z.object({ before: entityContext, after: entityContext })

/**
 * Assigned values define the processing responsibility; context retains supporting evidence.
 * JSON strings preserve upstream keys that Convex object fields cannot represent.
 */
export const ChangeEventInputContent = z.object({ assigned: recordPair, context })
/** Decoded evidence for one independently completable processing responsibility. */
export type ChangeEventInputContent = z.infer<typeof ChangeEventInputContent>

/** Queryable identity and observation interval shared by inputs and entity events. */
export const entityChangeFields = v.object({
  /** Earlier observation time; null denotes comparison against an empty initial catalog. */
  from_scan_at: v.union(v.string(), v.null()),
  /** Later observation time, independent of when processing creates the event. */
  scan_at: v.string(),
  entity_kind: v.union(v.literal('model'), v.literal('provider'), v.literal('endpoint')),
  /** Projected entity identity within the namespace selected by entity kind. */
  entity_id: v.string(),
  /** Lifecycle covers appearance/disappearance; pricing and attributes cover existing entities. */
  category: v.union(v.literal('lifecycle'), v.literal('pricing'), v.literal('attributes')),
  /** Serialized input evidence or event content, validated by the phase that owns it. */
  content: v.string(),
})

/** Retained evidence indexed for unfinished work and idempotent acceptance at each later scan. */
export const changeEventInputsTable = defineTable(
  entityChangeFields.extend({
    /** Permanent completion, including decisions that produce no event; false also covers deferral. */
    processed: v.boolean(),
  }),
)
  .index('by_processed', ['processed'])
  .index('by_processed_and_scan_at', ['processed', 'scan_at'])
  .index('by_scan_at_and_entity_kind_and_entity_id_and_category', [
    'scan_at',
    'entity_kind',
    'entity_id',
    'category',
  ])

/** Arbitrary upstream keys remain JSON; event identity stays queryable in Convex. */
export const EntityChangeContent = z.object({ changes: recordPair, context })
/** Decoded changes and historical context sufficient to render without current-data lookups. */
export type EntityChangeContent = z.infer<typeof EntityChangeContent>

/** Stored entity event with queryable identity and references to its supporting inputs. */
export const EntityChange = entityChangeFields.extend({
  /** Contributing evidence retained for explanation after those inputs finish processing. */
  input_ids: v.array(v.id(CHANGE_EVENT_INPUTS_TABLE)),
})
/** Event body before Convex adds document identity and creation time. */
export type EntityChange = Infer<typeof EntityChange>

/** Immutable entity history indexed by observation time and entity identity. */
export const changeEventsTable = defineTable(EntityChange)
  .index('by_scan_at', ['scan_at'])
  .index('by_entity_kind_and_entity_id', ['entity_kind', 'entity_id'])
