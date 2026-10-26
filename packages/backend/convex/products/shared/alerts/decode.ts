import { ConvexError } from 'convex/values'
import { z } from 'zod'

import { Endpoint, Model, Provider } from '../../../catalog/entities'
import { decodePricing } from '../../../catalog/pricing'
import type { Pricing } from '../../../catalog/pricing'
import type { EventRow } from '../../../catalog/tables/events'

export const CapturedChange = z.object({
  get changes() {
    return z.array(CapturedChange).optional()
  },
  embeddedKey: z.string().optional(),
  key: z.string(),
  oldValue: z.json().optional(),
  type: z.enum(['ADD', 'REMOVE', 'UPDATE']),
  value: z.json().optional(),
})

export type CapturedChange = z.infer<typeof CapturedChange>

const Update = z.object({ changes: z.array(CapturedChange) })

const snapshots = {
  endpoint: z.object({ value: Endpoint }),
  model: z.object({ value: Model }),
  provider: z.object({ value: Provider }),
}

export type Snapshot =
  | { entity_kind: 'model'; value: z.infer<typeof Model> }
  | { entity_kind: 'provider'; value: z.infer<typeof Provider> }
  | { entity_kind: 'endpoint'; value: z.infer<typeof Endpoint> }

type Field = { path: string[]; change: CapturedChange }

type DecodedEvent =
  | { type: 'ADD'; after: Snapshot }
  | { type: 'REMOVE'; before: Snapshot }
  | {
      type: 'UPDATE'
      changes: Field[]
      pricing?: { before: z.infer<typeof Pricing>; after: z.infer<typeof Pricing> }
    }

function decodeSnapshot(entity_kind: EventRow['entity_kind'], payload: unknown): Snapshot {
  if (entity_kind === 'model') {
    return { entity_kind, value: snapshots.model.parse(payload).value }
  }

  return entity_kind === 'provider'
    ? { entity_kind, value: snapshots.provider.parse(payload).value }
    : { entity_kind, value: snapshots.endpoint.parse(payload).value }
}

/** Decode once; the row supplies the authoritative root operation and identity. */
export function decode(row: EventRow): DecodedEvent {
  const payload: unknown = JSON.parse(row.change_json)

  if (row.type === 'UPDATE') {
    const pricing = row.entity_kind === 'endpoint' ? row.context.pricing : undefined

    return {
      changes: fields(Update.parse(payload).changes),
      type: 'UPDATE',
      ...(pricing === undefined
        ? {}
        : {
            pricing: {
              after: decodePricing(pricing.after),
              before: decodePricing(pricing.before),
            },
          }),
    }
  }

  const snapshot = decodeSnapshot(row.entity_kind, payload)

  return row.type === 'ADD'
    ? { after: snapshot, type: 'ADD' }
    : { before: snapshot, type: 'REMOVE' }
}

/** Consume structural wrappers here so curation never has to rediscover their shape. */
function fields(changes: CapturedChange[], parent: string[] = []): Field[] {
  return changes.flatMap((change) => {
    const path = [...parent, change.key]

    const wrapper =
      (path.length === 1 && (change.key === 'metadata' || change.key === 'pricing')) ||
      (path.length === 2 && parent[0] === 'pricing' && change.key === 'meters')

    if (!wrapper) {
      return [{ change, path }]
    }

    if (change.type !== 'UPDATE' || change.changes === undefined) {
      throw new ConvexError({ message: 'Invalid event container', path: path.join('.') })
    }

    return fields(change.changes, path)
  })
}
