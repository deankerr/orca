import type { CuratedEvent } from '../curate'
import { colors, embedCard, gridUrl, logoUrl } from './card'
import type { Card, DiscordUrls } from './card'
import { escape, lifecycleMarker } from './display'
import { fieldChange } from './fields'

/** Providers are discovered once; endpoint presence can disappear and return repeatedly. */
export function providerCard(event: CuratedEvent, urls: DiscordUrls): Card | null {
  if (event.entity_kind !== 'provider') {
    return null
  }

  const { provider } = event.context
  const changes = 'changes' in event ? event.changes : []

  if ('changes' in event && changes.length === 0) {
    return null
  }

  const content =
    'after' in event
      ? event.previously_known === false
        ? `Provider **${escape(provider.display_name)}** discovered.`
        : event.previously_known === true
          ? `Provider **${escape(provider.display_name)}** has listed endpoints again.`
          : `Provider **${escape(provider.display_name)}** now has listed endpoints.`
      : 'before' in event
        ? `Provider **${escape(provider.display_name)}** has no more listed endpoints.`
        : [
            `Provider **${escape(provider.display_name)}** updated.`,
            ...changes.map((change) => fieldChange(change)),
          ].join('\n\n')

  return embedCard(lifecycleMarker(event) + content, {
    author: {
      name: provider.provider_id,
      url: gridUrl(provider.provider_id, urls),
      iconURL: logoUrl(provider.provider_id, urls),
    },
    timestamp: event.observed_at,
    color: 'after' in event ? colors.added : 'before' in event ? colors.removed : colors.updated,
  })
}
