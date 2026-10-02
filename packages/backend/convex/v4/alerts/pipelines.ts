import type { EventRow } from '../events/query'
import { batchAlerts } from './batch'
import type { Alert, IndividualAlert } from './batch'
import { curate } from './curate'
import type { EntityAlert } from './curate'
import { isEligible } from './filter'
import { select } from './select'

/** Feed retains the broader curated field set and the existing pricing policy. */
export function forFeed(row: EventRow): EntityAlert | null {
  return prepare(row)
}

function prepare(row: EventRow): EntityAlert | null {
  const alert = curate(row)

  return alert !== null && isEligible(alert) ? alert : null
}

function selected(row: EventRow): EntityAlert | null {
  const alert = prepare(row)

  return alert === null ? null : select(alert)
}

/** Monitor prepares each event independently; pagination never determines batch membership. */
export function forMonitor(row: EventRow): EntityAlert | null {
  return selected(row)
}

/** Select before batching so residual fields retain their original event's eligibility. */
export function forDiscord(rows: (EventRow & { _id: string })[]): {
  alerts: Alert[]
  skipped: number
} {
  const alerts: IndividualAlert[] = []
  let skipped = 0

  for (const row of rows) {
    const event = selected(row)

    if (event === null) {
      skipped += 1
    } else {
      alerts.push({ type: 'event', event_id: row._id, event })
    }
  }

  return { alerts: batchAlerts(alerts), skipped }
}
