import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { currentEndpointsTable } from '../catalog/endpoints/table'
import { currentModelsTable } from '../catalog/models/table'
import { currentProvidersTable } from '../catalog/providers/table'
import { pairTimes } from '../scan/time'

export const V4_EVENTS_TABLE = 'v4_events' as const

const model = currentModelsTable.validator.pick('model_id', 'display_name')
const provider = currentProvidersTable.validator.pick('provider_id', 'display_name')
const endpoint = currentEndpointsTable.validator.pick(
  'endpoint_id',
  'provider_tag',
  'provider_display_name',
)

const fields = {
  ...pairTimes.fields,
  entity_id: v.string(),
  type: v.union(v.literal('ADD'), v.literal('UPDATE'), v.literal('REMOVE')),
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
      context: v.object({ model, provider, endpoint }),
    }),
  ),
)

export type EventRow = Infer<typeof eventsTable.validator>
