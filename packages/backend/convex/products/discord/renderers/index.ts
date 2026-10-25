import type { Alert } from '../../shared/alerts/batch'
import type { EntityAlert } from '../../shared/alerts/curate'
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
      ? batchCards(alert, urls)
      : [{ message: renderDiscord(alert.event, urls), source_ids: [alert.source_id] }],
  )
}

function renderDiscord(event: EntityAlert, urls: DiscordUrls): Card {
  return { allowed_mentions: { parse: [] }, ...entityCard(event, urls) }
}

function entityCard(event: EntityAlert, urls: DiscordUrls): Card {
  if (event.entity_kind === 'model') {
    return modelCard(event, urls)
  }

  return event.entity_kind === 'provider' ? providerCard(event, urls) : endpointCard(event, urls)
}
