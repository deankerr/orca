import { batchAlerts } from '../shared/alerts/batch'
import type { Alert, IndividualAlert } from '../shared/alerts/batch'
import type { EntityAlert } from '../shared/alerts/curate'
import type { PricingCandidate } from './frequency'

/** Select before batching so residual fields retain their original event's eligibility. */
export async function prepareBatch(
  rows: { source_id: string; event: EntityAlert | null }[],
  readFrequency: (candidates: PricingCandidate[]) => Promise<boolean[]>,
): Promise<{
  alerts: Alert[]
  skipped: number
  skippedEvents: { source_id: string; reason: 'ineligible' | 'frequent_pricing' }[]
}> {
  const alerts: IndividualAlert[] = []
  const skippedEvents: { source_id: string; reason: 'ineligible' | 'frequent_pricing' }[] = []

  for (const row of rows) {
    const { event } = row

    if (event === null) {
      skippedEvents.push({ reason: 'ineligible', source_id: row.source_id })
    } else {
      alerts.push({ event, source_id: row.source_id, type: 'event' })
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
      skippedEvents.push({ reason: 'frequent_pricing', source_id: alert.source_id })

      return []
    }

    return [{ ...alert, event: { ...alert.event, changes } }]
  })

  return { alerts: batchAlerts(selected), skipped: skippedEvents.length, skippedEvents }
}
