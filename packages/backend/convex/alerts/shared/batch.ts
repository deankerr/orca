import { canonicalJson } from '../../json'
import type { EntityAlert, FieldChange } from './curate'

export type IndividualAlert = { type: 'event'; event_id: string; event: EntityAlert }
export type BatchAlert = { type: 'batch'; change: FieldChange; members: IndividualAlert[] }
export type Alert = IndividualAlert | BatchAlert

const BATCH_THRESHOLD = 5

/** Extract repeated field items; retain the remaining event and its source identity. */
export function batchAlerts(events: IndividualAlert[]): Alert[] {
  const groups = new Map<
    string,
    { batch: BatchAlert; occurrences: [IndividualAlert, number][]; entities: Set<string> }
  >()

  for (const bucket of events) {
    const { event } = bucket

    if (!('changes' in event)) {
      continue
    }

    for (const [index, change] of event.changes.entries()) {
      const key = JSON.stringify([event.observed_at, event.entity_kind, canonicalJson(change)])
      let group = groups.get(key)

      if (group === undefined) {
        group = {
          batch: { type: 'batch', change, members: [] },
          occurrences: [],
          entities: new Set(),
        }
        groups.set(key, group)
      }

      group.occurrences.push([bucket, index])

      if (!group.entities.has(event.entity_id)) {
        group.batch.members.push(bucket)
        group.entities.add(event.entity_id)
      }
    }
  }

  const extracted = new Map<IndividualAlert, Map<number, BatchAlert>>()

  for (const { batch, occurrences } of groups.values()) {
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
      result.push(bucket)
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
