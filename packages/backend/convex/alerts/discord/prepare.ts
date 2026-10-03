import type { EventRow } from '../../events/table'
import { batchAlerts } from '../shared/batch'
import type { Alert, IndividualAlert } from '../shared/batch'
import { prepare } from '../shared/prepare'

/** Select before batching so residual fields retain their original event's eligibility. */
export function prepareBatch(rows: (EventRow & { _id: string })[]): {
  alerts: Alert[]
  skipped: number
} {
  const alerts: IndividualAlert[] = []
  let skipped = 0

  for (const row of rows) {
    const event = prepare(row)

    if (event === null) {
      skipped += 1
    } else {
      alerts.push({ type: 'event', event_id: row._id, event })
    }
  }

  return { alerts: batchAlerts(alerts), skipped }
}
