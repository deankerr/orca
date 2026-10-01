import type { EventRow } from '../../events/query'
import { selectEvent } from '../select'
import type { Card, DiscordUrls } from './card'
import { endpointCard } from './endpointCard'
import { modelCard } from './modelCard'
import { providerCard } from './providerCard'

/** Each card owns its applicability and presentation; captured events are never modified. */
export function renderDiscord(row: EventRow, urls: DiscordUrls): Card | null {
  const event = selectEvent(row)

  if (event === null) {
    return null
  }

  const card = modelCard(event, urls) ?? providerCard(event, urls) ?? endpointCard(event, urls)

  return card === null ? null : { allowed_mentions: { parse: [] }, ...card }
}
