import * as R from 'remeda'

import { previousCollections } from './source'
import type { Collections, Source } from './source'

/**
 * How much of a pair's current state to emit. Departures suffice behind a committed full pair;
 * changes always suffice once a baseline lands; full makes the view complete for its scan.
 */
export type CurrentScope = 'full' | 'changes' | 'departures'

/** Receipt coverage per scope: each scope's output includes the narrower ones. */
export const SCOPE_COVERAGE = { changes: 1, departures: 0, full: 2 } as const satisfies Record<
  CurrentScope,
  number
>

type Versioned = { scan_at: string }

/** Present entities produce listed candidates; departures carry last-present facts unlisted at the scan. */
export function deriveCurrent<Entity, Row extends Versioned>(
  source: Source,
  scope: CurrentScope,
  select: (scan: Collections) => ReadonlyMap<string, Entity>,
  toRow: (entity: Entity, version: { scan_at: string; unlisted_at?: string }) => Row,
): Row[] {
  const { scan_at } = source.next
  const previous = select(previousCollections(source))
  const next = select(source.next)
  // A baseline has nothing to compare, so it always states its complete population.
  const emit = source.previous === null ? 'full' : scope
  const rows: Row[] = []

  if (emit !== 'departures') {
    for (const [id, entity] of next) {
      const row = toRow(entity, { scan_at })
      const before = previous.get(id)

      if (
        emit === 'full' ||
        before === undefined ||
        !R.isDeepEqual(toRow(before, { scan_at }), row)
      ) {
        rows.push(row)
      }
    }
  }

  for (const [id, entity] of previous) {
    if (!next.has(id)) {
      rows.push(toRow(entity, { scan_at, unlisted_at: scan_at }))
    }
  }

  return rows
}

/** Newest version wins at commit, so candidates commute regardless of execution order. */
export function supersedes(retained: Versioned | null, candidate: Versioned): boolean {
  return retained === null || candidate.scan_at > retained.scan_at
}
