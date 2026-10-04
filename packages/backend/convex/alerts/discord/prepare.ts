import type { EventRow } from '../../events/table'
import { batchAlerts } from '../shared/batch'
import type { Alert, IndividualAlert } from '../shared/batch'
import { prepare } from '../shared/prepare'
import type { PricingCandidate } from './frequency'

/** Select before batching so residual fields retain their original event's eligibility. */
export async function prepareBatch(
  rows: (EventRow & { _id: string })[],
  readFrequency: (candidates: PricingCandidate[]) => Promise<boolean[]>,
): Promise<{ alerts: Alert[]; skipped: number }> {
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

  const candidates = alerts.filter(
    ({ event }) =>
      event.type === 'endpoint_updated' &&
      event.changes.some((change) => change.path.startsWith('pricing.')) &&
      !event.changes.some((change) => change.path === 'pricing.overrides'),
  )

  const frequent =
    candidates.length === 0
      ? []
      : await readFrequency(
          candidates.map(({ event }) => ({
            endpoint_id: event.entity_id,
            scan_at: event.observed_at,
          })),
        )

  const suppressed = new Set(candidates.filter((_event, index) => frequent[index]))

  const selected = alerts.flatMap((alert) => {
    if (!suppressed.has(alert) || alert.event.type !== 'endpoint_updated') {
      return [alert]
    }

    const changes = alert.event.changes.filter((change) => !change.path.startsWith('pricing.'))

    if (changes.length === 0) {
      skipped += 1
      return []
    }

    return [{ ...alert, event: { ...alert.event, changes } }]
  })

  return { alerts: batchAlerts(selected), skipped }
}
