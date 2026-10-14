import { defineTable } from 'convex/server'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

export const OBSERVATIONS_TABLE = 'catalog_observations' as const

const fields = { entity_id: v.string(), scan_at: v.string() }

export const endpointObservation = v.object({
  ...fields,
  entity_kind: v.literal('endpoint'),
  detected: v.boolean(),
  model_id: v.string(),
  provider_id: v.string(),
  provider_tag: v.string(),
})

export const observationsTable = defineTable(
  v.union(
    v.object({
      ...fields,
      entity_kind: v.literal('model'),
      detected: v.boolean(),
      endpoint_count: v.number(),
    }),
    v.object({
      ...fields,
      entity_kind: v.literal('provider'),
      endpoint_count: v.number(),
    }),
    endpointObservation,
  ),
)
  .index('by_entity_kind_and_entity_id_and_scan_at', ['entity_kind', 'entity_id', 'scan_at'])
  .index('by_model_id_and_scan_at', ['model_id', 'scan_at'])
  .index('by_provider_id_and_scan_at', ['provider_id', 'scan_at'])
  .index('by_scan_at', ['scan_at'])

export type ObservationRow = Infer<typeof observationsTable.validator>
