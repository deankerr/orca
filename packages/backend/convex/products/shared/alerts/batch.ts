import { compare } from '../../../compare'
import type { AlertChange, EntityAlert } from './curate'

export type IndividualAlert = { type: 'event'; source_id: string; event: EntityAlert }

export type BatchAlert = {
  type: 'batch'
  change: AlertChange | { kind: 'endpoint_removed' }
  members: IndividualAlert[]
}

export type Alert = IndividualAlert | BatchAlert

const BATCH_THRESHOLD = 3

function batchableChanges(event: EntityAlert): BatchAlert['change'][] {
  if (event.type === 'endpoint_removed') {
    return [{ kind: 'endpoint_removed' }]
  }

  return 'changes' in event ? event.changes : []
}

/** Equivalent changes from distinct entities, and where each occurs among the source alerts. */
type Group = {
  batch: BatchAlert
  occurrences: [IndividualAlert, number][]
  entities: Set<string>
}

/** Locates a batched change by its alert and its index in that alert's batchable changes. */
type Batched = Map<IndividualAlert, Map<number, BatchAlert>>

/** Group endpoint unlistings and repeated field items; retain source identities and residual fields. */
export function batchAlerts(events: IndividualAlert[]): Alert[] {
  return emit(events, batched(groupChanges(events)))
}

/** Equivalent changes share a scan, entity kind, change kind and field. */
function groupChanges(events: IndividualAlert[]): Group[] {
  const groups = new Map<string, Group[]>()

  for (const bucket of events) {
    const { event } = bucket

    for (const [index, change] of batchableChanges(event).entries()) {
      const key = JSON.stringify([
        event.observed_at,
        event.entity_kind,
        change.kind,
        'field' in change ? change.field : null,
      ])

      const candidates = groups.get(key) ?? []

      let group = candidates.find(
        (candidate) => compare(candidate.batch.change, change).length === 0,
      )

      if (group === undefined) {
        group = {
          batch: { change, members: [], type: 'batch' },
          entities: new Set(),
          occurrences: [],
        }
        candidates.push(group)
        groups.set(key, candidates)
      }

      group.occurrences.push([bucket, index])

      if (!group.entities.has(event.entity_id)) {
        group.batch.members.push(bucket)
        group.entities.add(event.entity_id)
      }
    }
  }

  return [...groups.values()].flat()
}

/** Changes whose group reaches the batching threshold move into that group's batch. */
function batched(groups: Group[]): Batched {
  const result: Batched = new Map()

  for (const { batch, occurrences } of groups) {
    if (batch.members.length >= BATCH_THRESHOLD) {
      for (const [bucket, index] of occurrences) {
        const items = result.get(bucket) ?? new Map<number, BatchAlert>()
        items.set(index, batch)
        result.set(bucket, items)
      }
    }
  }

  return result
}

/** Alerts keep source order; each batch appears once, at its first occurrence. */
function emit(events: IndividualAlert[], batches: Batched): Alert[] {
  const result: Alert[] = []
  const emitted = new Set<BatchAlert>()

  const place = (batch: BatchAlert) => {
    if (!emitted.has(batch)) {
      result.push(batch)
      emitted.add(batch)
    }
  }

  for (const bucket of events) {
    const { event } = bucket
    const items = batches.get(bucket)

    if (!('changes' in event)) {
      const batch = items?.get(0)

      if (batch === undefined) {
        result.push(bucket)
      } else {
        place(batch)
      }

      continue
    }

    const changes = event.changes.filter((_change, index) => {
      const batch = items?.get(index)

      if (batch !== undefined) {
        place(batch)
      }

      return batch === undefined
    })

    if (changes.length > 0) {
      result.push({ ...bucket, event: { ...event, changes } })
    }
  }

  return result
}
