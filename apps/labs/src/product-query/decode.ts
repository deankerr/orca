import * as Core from '@orca/schema/archive-core.ts'
import * as Schema from 'effect/Schema'

import type { EntityType, EventType, FieldChange } from '../projection/types.ts'
import type { ProductEvent } from './types.ts'

export interface EventRow {
  readonly after_json: string | null
  readonly after_present: number | null
  readonly before_json: string | null
  readonly before_present: number | null
  readonly context_json: string
  readonly crawl_id: string
  readonly entity_id: string
  readonly entity_type: EntityType
  readonly event_id: string
  readonly event_type: EventType
  readonly ordinal: number | null
  readonly path: string | null
  readonly model_slug: string
  readonly provider_name: string | null
  readonly provider_slug: string | null
}

const endpointContextSchema = Schema.fromJsonString(
  Schema.Struct({
    endpoint: Core.CoreEndpoint,
    model: Schema.Struct({ name: Schema.String, slug: Schema.String }),
  }),
)
const modelContextSchema = Schema.fromJsonString(Core.CoreModel)

const parseStoredJson = (value: string | null): unknown =>
  value === null ? undefined : JSON.parse(value)

const fieldFromRow = (row: EventRow): FieldChange | undefined => {
  if (row.ordinal === null || row.path === null) {
    return undefined
  }
  const beforePresent = row.before_present === 1
  const afterPresent = row.after_present === 1
  return {
    after: afterPresent ? parseStoredJson(row.after_json) : undefined,
    afterPresent,
    before: beforePresent ? parseStoredJson(row.before_json) : undefined,
    beforePresent,
    path: row.path,
  }
}

export const decodeEventRows = (rows: readonly EventRow[]): readonly ProductEvent[] => {
  const events = new Map<string, ProductEvent & { fields: FieldChange[] }>()
  for (const row of rows) {
    let event = events.get(row.event_id)
    if (event === undefined) {
      const common = {
        crawlId: row.crawl_id,
        entityId: row.entity_id,
        eventId: row.event_id,
        eventType: row.event_type,
        fields: [],
        modelSlug: row.model_slug,
        providerName: row.provider_name ?? undefined,
        providerSlug: row.provider_slug ?? undefined,
      }
      event =
        row.entity_type === 'endpoint'
          ? {
              ...common,
              context: Schema.decodeUnknownSync(endpointContextSchema)(row.context_json),
              entityType: row.entity_type,
            }
          : {
              ...common,
              context: Schema.decodeUnknownSync(modelContextSchema)(row.context_json),
              entityType: row.entity_type,
            }
      events.set(row.event_id, event)
    }
    const field = fieldFromRow(row)
    if (field !== undefined) {
      event.fields.push(field)
    }
  }
  return [...events.values()]
}

export const endpointContext = (event: ProductEvent) => {
  if (event.entityType !== 'endpoint') {
    throw new Error(`expected endpoint event, received ${event.entityType}`)
  }
  return event.context
}
