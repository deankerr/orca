import type { EventRow } from '../../../catalog/tables/events'
import { curate } from './curate'
import type { EntityAlert } from './curate'
import { isEligible } from './filter'
import { select } from './select'

/** The current default content policy, explicitly selected by each alert product. */
export function selectDefault(alert: EntityAlert | null): EntityAlert | null {
  return alert !== null && isEligible(alert) ? select(alert) : null
}

/** Pure convenience for preparing individual captured Events. */
export function prepare(row: EventRow): EntityAlert | null {
  return selectDefault(interpretEvent(row))
}

/** Decode one Event; malformed captured payloads do not hide healthy neighboring records. */
export function interpretEvent(row: EventRow): EntityAlert | null {
  try {
    return curate(row)
  } catch (error) {
    console.error('[alerts] could not prepare event', {
      entity_id: row.entity_id,
      entity_kind: row.entity_kind,
      error,
      scan_at: row.scan_at,
      source_id: '_id' in row ? row._id : undefined,
    })

    return null
  }
}
