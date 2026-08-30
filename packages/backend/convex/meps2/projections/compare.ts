import { diff } from 'json-diff-ts'
import type { IChange, Options as DiffOptions } from 'json-diff-ts'

export type MapChange<T> =
  | { id: string; kind: 'create'; next: T }
  | { id: string; kind: 'absent' }
  | { id: string; kind: 'update'; next: T; changeset: IChange[] }

export function compareMaps<T>(
  before: Map<string, T>,
  after: Map<string, T>,
  options?: DiffOptions,
): MapChange<T>[] {
  const changes: MapChange<T>[] = []
  const ids = [...new Set([...before.keys(), ...after.keys()])].toSorted()

  for (const id of ids) {
    const prev = before.get(id)
    const next = after.get(id)

    if (prev !== undefined && next === undefined) {
      changes.push({ id, kind: 'absent' })
      continue
    }

    if (prev === undefined && next !== undefined) {
      changes.push({ id, kind: 'create', next })
      continue
    }

    if (prev === undefined || next === undefined) {
      continue
    }

    const changeset = diff(prev, next, options) ?? []
    if (changeset.length === 0) {
      continue
    }

    changes.push({ id, kind: 'update', next, changeset })
  }

  return changes
}

export function viewWrites<T>(changes: MapChange<T>[]): { upserts: T[]; deletes: string[] } {
  const upserts: T[] = []

  for (const change of changes) {
    // models/providers: catalog-absent rows are retained and unstamped.
    // endpoints stamp unlisted_at in planEndpoints, not here.
    if (change.kind !== 'absent') {
      upserts.push(change.next)
    }
  }

  return { upserts, deletes: [] }
}
