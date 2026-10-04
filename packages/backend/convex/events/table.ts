import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { currentEndpointsTable } from '../catalog/endpoints/table'
import { currentModelsTable } from '../catalog/models/table'
import { currentProvidersTable } from '../catalog/providers/table'
import { pricing } from '../entities'

export const V4_EVENTS_TABLE = 'v4_events' as const

const model = currentModelsTable.validator.pick('model_id', 'display_name')
const provider = currentProvidersTable.validator.pick('provider_id', 'display_name')

const endpoint = currentEndpointsTable.validator.pick(
  'endpoint_id',
  'provider_tag',
  'provider_display_name',
)

const fields = {
  scan_at: v.string(),
  entity_id: v.string(),
  type: v.union(v.literal('ADD'), v.literal('UPDATE'), v.literal('REMOVE')),
  /** Set on arrivals after historical enrichment; absent on changes and departures. */
  previously_known: v.optional(v.boolean()),
  /** Legacy preview compatibility only; new events never write it and alerts ignore it. */
  pricing_is_scheduled: v.optional(v.boolean()),
  /** One serialized json-diff-ts entity-root node; values may have arbitrary keys. */
  change_json: v.string(),
}

/** One entity's changes for an ingestion, with the identity context appropriate to its kind. */
export const eventsTable = defineTable(
  v.union(
    v.object({
      ...fields,
      entity_kind: v.literal('model'),
      context: v.object({ model }),
    }),
    v.object({
      ...fields,
      entity_kind: v.literal('provider'),
      context: v.object({ provider }),
    }),
    v.object({
      ...fields,
      entity_kind: v.literal('endpoint'),
      context: v.object({
        model,
        provider,
        endpoint,
        /** Complete observed quotes on pricing updates; absent on older events and other changes. */
        pricing: v.optional(v.object({ before: pricing, after: pricing })),
      }),
    }),
  ),
)
  .index('by_scan_at', ['scan_at'])
  .index('by_entity_kind_and_entity_id_and_scan_at', ['entity_kind', 'entity_id', 'scan_at'])
  .index('by_model_id_and_scan_at', ['context.model.model_id', 'scan_at'])
  .index('by_provider_id_and_scan_at', ['context.provider.provider_id', 'scan_at'])

export type EventRow = Infer<typeof eventsTable.validator>
