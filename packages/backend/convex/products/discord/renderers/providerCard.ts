import type { EntityAlert } from '../../shared/alerts/curate'
import { embedCard, gridUrl, lifecycleColor, logoUrl } from './card'
import type { Card, DiscordUrls } from './card'
import { arrival, escape, lifecycleMarker } from './display'
import { fieldChange } from './fields'

type ProviderAlert = Extract<EntityAlert, { entity_kind: 'provider' }>

const arrivals = {
  discovered: 'discovered',
  listed: 'now has listed endpoints',
  relisted: 'has listed endpoints again',
}

/** Providers are discovered once; endpoint presence can disappear and return repeatedly. */
export function providerCard(event: ProviderAlert, urls: DiscordUrls): Card {
  const { provider } = event.context

  return embedCard(lifecycleMarker(event) + providerContent(event), {
    author: {
      iconURL: logoUrl(provider.provider_id, urls),
      name: provider.provider_id,
      url: gridUrl(provider.provider_id, urls),
    },
    color: lifecycleColor(event),
    timestamp: event.observed_at,
  })
}

function providerContent(event: ProviderAlert): string {
  const subject = `Provider **${escape(event.context.provider.display_name)}**`

  if ('after' in event) {
    return `${subject} ${arrivals[arrival(event.previously_known)]}.`
  }

  if ('before' in event) {
    return `${subject} has no more listed endpoints.`
  }

  return [`${subject} updated.`, ...event.changes.map((change) => fieldChange(change))].join('\n\n')
}
