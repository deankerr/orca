import { ConvexError } from 'convex/values'
import { z } from 'zod'

import { Endpoint, Model, Provider } from '../../entities'
import type { EventRow } from '../../events/table'

const CapturedChange = z.object({
  key: z.string(),
  type: z.enum(['ADD', 'REMOVE', 'UPDATE']),
  value: z.json().optional(),
  oldValue: z.json().optional(),
  embeddedKey: z.string().optional(),
  get changes() {
    return z.array(CapturedChange).optional()
  },
})
export type CapturedChange = z.infer<typeof CapturedChange>

const Update = z.object({ changes: z.array(CapturedChange) })
const snapshots = {
  model: z.object({ value: Model }),
  provider: z.object({ value: Provider }),
  endpoint: z.object({ value: Endpoint }),
}

export type Snapshot =
  | { entity_kind: 'model'; value: z.infer<typeof Model> }
  | { entity_kind: 'provider'; value: z.infer<typeof Provider> }
  | { entity_kind: 'endpoint'; value: z.infer<typeof Endpoint> }

type Field = { path: string[]; change: CapturedChange }
type DecodedEvent =
  | { type: 'ADD'; after: Snapshot }
  | { type: 'REMOVE'; before: Snapshot }
  | { type: 'UPDATE'; changes: Field[] }

/** Decode once; the row supplies the authoritative root operation and identity. */
export function decode(row: EventRow): DecodedEvent {
  const payload: unknown = JSON.parse(row.change_json)

  if (row.type === 'UPDATE') {
    return { type: 'UPDATE', changes: fields(Update.parse(payload).changes) }
  }

  const snapshot: Snapshot =
    row.entity_kind === 'model'
      ? { entity_kind: 'model', value: snapshots.model.parse(payload).value }
      : row.entity_kind === 'provider'
        ? { entity_kind: 'provider', value: snapshots.provider.parse(payload).value }
        : { entity_kind: 'endpoint', value: snapshots.endpoint.parse(payload).value }

  return row.type === 'ADD'
    ? { type: 'ADD', after: snapshot }
    : { type: 'REMOVE', before: snapshot }
}

/** Consume structural wrappers here so curation never has to rediscover their shape. */
function fields(changes: CapturedChange[], parent: string[] = []): Field[] {
  return changes.flatMap((change) => {
    const path = [...parent, change.key]
    const wrapper =
      (path.length === 1 && (change.key === 'metadata' || change.key === 'pricing')) ||
      (path.length === 2 && parent[0] === 'pricing' && change.key === 'meters')

    if (!wrapper) {
      return [{ path, change }]
    }

    if (change.type !== 'UPDATE' || change.changes === undefined) {
      throw new ConvexError({ message: 'Invalid event container', path: path.join('.') })
    }

    return fields(change.changes, path)
  })
}
