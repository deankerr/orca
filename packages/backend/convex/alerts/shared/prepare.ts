import type { EventRow } from '../../events/table'
import { curate } from './curate'
import type { EntityAlert } from './curate'
import { isEligible } from './filter'
import { select } from './select'

/** Interpret, check eligibility, and select the shared default alert content. */
export function prepare(row: EventRow): EntityAlert | null {
  let alert: EntityAlert | null

  try {
    alert = curate(row)
  } catch (error) {
    console.error('[alerts] could not prepare event', {
      event_id: '_id' in row ? row._id : undefined,
      entity_kind: row.entity_kind,
      entity_id: row.entity_id,
      scan_at: row.scan_at,
      error,
    })

    return null
  }

  return alert !== null && isEligible(alert) ? select(alert) : null
}
