import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { endpointIdentity, modelIdentity, providerIdentity } from '../entities'
import { pricing } from '../pricing'

export const EVENTS_TABLE = 'catalog_events' as const

const fields = {
  scan_at: v.string(),
  entity_id: v.string(),
  type: v.union(v.literal('ADD'), v.literal('UPDATE'), v.literal('REMOVE')),
  /** One serialized json-diff-ts entity-root node; values may have arbitrary keys. */
  change_json: v.string(),
}

/** One entity's changes observed at a scan time, without historical or product classification. */
export const eventsTable = defineTable(
  v.union(
    v.object({
      ...fields,
      entity_kind: v.literal('model'),
      context: v.object({ model: modelIdentity }),
    }),
    v.object({
      ...fields,
      entity_kind: v.literal('provider'),
      context: v.object({ provider: providerIdentity }),
    }),
    v.object({
      ...fields,
      entity_kind: v.literal('endpoint'),
      context: v.object({
        model: modelIdentity,
        provider: providerIdentity,
        endpoint: endpointIdentity,
        /** Complete observed quotes on pricing updates; absent on other changes. */
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
