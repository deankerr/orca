import type { CuratedEvent, FieldChange } from './curate'

export type EventBucket = { type: 'event'; event_id: string; event: CuratedEvent }
export type BatchBucket = { type: 'batch'; change: FieldChange; members: EventBucket[] }
export type Bucket = EventBucket | BatchBucket

const BATCH_THRESHOLD = 5

/** Compare object keys and string-set membership independently of upstream ordering. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.toSorted((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0))
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    )
  }

  return value
}

/** Extract repeated field items; retain the remaining event and its source identity. */
export function groupEvents(events: EventBucket[]): Bucket[] {
  const groups = new Map<
    string,
    { batch: BatchBucket; occurrences: [EventBucket, number][]; entities: Set<string> }
  >()

  for (const bucket of events) {
    const { event } = bucket

    if (!('changes' in event)) {
      continue
    }

    for (const [index, change] of event.changes.entries()) {
      const key = JSON.stringify([event.observed_at, event.entity_kind, canonical(change)])
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

  const extracted = new Map<EventBucket, Map<number, BatchBucket>>()

  for (const { batch, occurrences } of groups.values()) {
    if (batch.members.length >= BATCH_THRESHOLD) {
      for (const [bucket, index] of occurrences) {
        const items = extracted.get(bucket) ?? new Map<number, BatchBucket>()
        items.set(index, batch)
        extracted.set(bucket, items)
      }
    }
  }

  const result: Bucket[] = []
  const emitted = new Set<BatchBucket>()

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
