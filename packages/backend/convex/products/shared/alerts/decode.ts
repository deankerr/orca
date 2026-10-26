import { z } from 'zod'

import { Endpoint, Model, Provider } from '../../../catalog/entities'
import type { EventRow } from '../../../catalog/tables/events'
import type { JsonValue } from '../../../json'

/** A stored json-diff-ts node: a container of child changes, or a leaf carrying its values. */
export type CapturedChange =
  | { key: string; type: 'UPDATE'; changes: CapturedChange[]; embeddedKey?: string }
  | { key: string; type: 'UPDATE'; oldValue: JsonValue; value: JsonValue }
  | { key: string; type: 'ADD'; value: JsonValue }
  | { key: string; type: 'REMOVE'; value: JsonValue }

export const CapturedChange: z.ZodType<CapturedChange> = z.union([
  z.object({
    get changes() {
      return z.array(CapturedChange)
    },
    embeddedKey: z.string().optional(),
    key: z.string(),
    type: z.literal('UPDATE'),
  }),
  z.object({ key: z.string(), oldValue: z.json(), type: z.literal('UPDATE'), value: z.json() }),
  z.object({ key: z.string(), type: z.literal('ADD'), value: z.json() }),
  z.object({ key: z.string(), type: z.literal('REMOVE'), value: z.json() }),
])

const snapshots = {
  endpoint: z.object({ value: Endpoint }),
  model: z.object({ value: Model }),
  provider: z.object({ value: Provider }),
}

export type Snapshot =
  | { entity_kind: 'model'; value: z.infer<typeof Model> }
  | { entity_kind: 'provider'; value: z.infer<typeof Provider> }
  | { entity_kind: 'endpoint'; value: z.infer<typeof Endpoint> }

/** A lifecycle Event's complete entity; the row supplies the authoritative kind. */
export function decodeSnapshot(row: EventRow): Snapshot {
  const payload = row.change_json

  if (row.entity_kind === 'model') {
    return { entity_kind: 'model', value: snapshots.model.parse(JSON.parse(payload)).value }
  }

  return row.entity_kind === 'provider'
    ? { entity_kind: 'provider', value: snapshots.provider.parse(JSON.parse(payload)).value }
    : { entity_kind: 'endpoint', value: snapshots.endpoint.parse(JSON.parse(payload)).value }
}
