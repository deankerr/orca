import type { EventRow } from '../../events/query'
import type { CuratedEvent } from '../curate'
import { groupEvents } from '../group'
import type { EventBucket } from '../group'
import { selectEvent } from '../select'
import { batchCards } from './batchCards'
import type { Notification } from './batchCards'
import type { Card, DiscordUrls } from './card'
import { endpointCard } from './endpointCard'
import { modelCard } from './modelCard'
import { providerCard } from './providerCard'

/** Single-event preview uses the same selection and presentation as batch delivery. */
export function renderDiscord(row: EventRow, urls: DiscordUrls): Card | null {
  const event = selectEvent(row)

  return event === null ? null : renderSelectedEvent(event, urls)
}

/** Select once, extract repeated fields, and render without re-filtering event remainders. */
export function renderDiscordBatch(
  rows: (EventRow & { _id: string })[],
  urls: DiscordUrls,
): { notifications: Notification[]; skipped: number } {
  const events: EventBucket[] = []
  let skipped = 0

  for (const row of rows) {
    const event = selectEvent(row)

    if (event === null) {
      skipped += 1
    } else {
      events.push({ type: 'event', event_id: row._id, event })
    }
  }

  const notifications: Notification[] = []

  for (const bucket of groupEvents(events)) {
    if (bucket.type === 'batch') {
      notifications.push(...batchCards(bucket))
      continue
    }

    const message = renderSelectedEvent(bucket.event, urls)

    if (message === null) {
      skipped += 1
    } else {
      notifications.push({ message, event_ids: [bucket.event_id] })
    }
  }

  return { notifications, skipped }
}

/** The caller owns selection; remainders have already passed eligibility with their original event. */
function renderSelectedEvent(event: CuratedEvent, urls: DiscordUrls): Card | null {
  const card = modelCard(event, urls) ?? providerCard(event, urls) ?? endpointCard(event, urls)

  return card === null ? null : { allowed_mentions: { parse: [] }, ...card }
}
