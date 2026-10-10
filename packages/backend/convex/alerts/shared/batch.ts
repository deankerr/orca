import { compare } from '../../compare'
import type { EntityAlert, FieldChange } from './curate'

export type IndividualAlert = { type: 'event'; event_id: string; event: EntityAlert }
export type BatchAlert = {
  type: 'batch'
  change: FieldChange | { type: 'endpoint_removed' }
  members: IndividualAlert[]
}
export type Alert = IndividualAlert | BatchAlert

const BATCH_THRESHOLD = 3

/** Group endpoint unlistings and repeated field items; retain source identities and residual fields. */
export function batchAlerts(events: IndividualAlert[]): Alert[] {
  const groups = new Map<
    string,
    { batch: BatchAlert; occurrences: [IndividualAlert, number][]; entities: Set<string> }[]
  >()

  for (const bucket of events) {
    const { event } = bucket

    const changes: BatchAlert['change'][] =
      event.type === 'endpoint_removed'
        ? [{ type: 'endpoint_removed' }]
        : 'changes' in event
          ? event.changes
          : []

    for (const [index, change] of changes.entries()) {
      const key = JSON.stringify([
        event.observed_at,
        event.entity_kind,
        change.type,
        'path' in change ? change.path : null,
      ])
      const candidates = groups.get(key) ?? []
      let group = candidates.find(
        (candidate) => compare(candidate.batch.change, change).length === 0,
      )

      if (group === undefined) {
        group = {
          batch: { type: 'batch', change, members: [] },
          occurrences: [],
          entities: new Set(),
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

  const extracted = new Map<IndividualAlert, Map<number, BatchAlert>>()

  for (const { batch, occurrences } of [...groups.values()].flat()) {
    if (batch.members.length >= BATCH_THRESHOLD) {
      for (const [bucket, index] of occurrences) {
        const items = extracted.get(bucket) ?? new Map<number, BatchAlert>()
        items.set(index, batch)
        extracted.set(bucket, items)
      }
    }
  }

  const result: Alert[] = []
  const emitted = new Set<BatchAlert>()

  for (const bucket of events) {
    const { event } = bucket

    if (!('changes' in event)) {
      const batch = extracted.get(bucket)?.get(0)

      if (batch === undefined) {
        result.push(bucket)
      } else if (!emitted.has(batch)) {
        result.push(batch)
        emitted.add(batch)
      }

      continue
    }

    const changes = event.changes.filter((_change, index) => {
      const batch = extracted.get(bucket)?.get(index)

      if (batch === undefined) {
        return true
      }

      if (!emitted.has(batch)) {
        result.push(batch)
        emitted.add(batch)
      }

      return false
    })

    if (changes.length > 0) {
      result.push({ ...bucket, event: { ...event, changes } })
    }
  }

  return result
}
