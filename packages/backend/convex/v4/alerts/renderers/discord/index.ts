import type { Alert } from '../../batch'
import type { EntityAlert } from '../../curate'
import { batchCards } from './batchCards'
import type { Notification } from './batchCards'
import type { Card, DiscordUrls } from './card'
import { endpointCard } from './endpointCard'
import { modelCard } from './modelCard'
import { providerCard } from './providerCard'

/** Render prepared alerts, including residual fields, without applying eligibility again. */
export function renderDiscordBatch(alerts: Alert[], urls: DiscordUrls): Notification[] {
  return alerts.flatMap((alert) =>
    alert.type === 'batch'
      ? batchCards(alert)
      : [{ message: renderDiscord(alert.event, urls), event_ids: [alert.event_id] }],
  )
}

export function renderDiscord(event: EntityAlert, urls: DiscordUrls): Card {
  const card =
    event.entity_kind === 'model'
      ? modelCard(event, urls)
      : event.entity_kind === 'provider'
        ? providerCard(event, urls)
        : endpointCard(event, urls)

  return { allowed_mentions: { parse: [] }, ...card }
}
