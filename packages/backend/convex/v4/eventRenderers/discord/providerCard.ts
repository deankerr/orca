import type { CuratedEvent, FieldChange } from '../curate'
import { colors, embedCard, gridUrl, logoUrl } from './card'
import type { Card, DiscordUrls } from './card'
import { escape } from './display'
import { fact, fieldChange } from './fields'

/** Providers are discovered once; endpoint presence can disappear and return repeatedly. */
export function providerCard(event: CuratedEvent, urls: DiscordUrls): Card | null {
  if (event.entity_kind !== 'provider') {
    return null
  }

  const { provider } = event.context
  const changes = 'changes' in event ? providerChanges(event.changes) : []

  if ('changes' in event && changes.length === 0) {
    return null
  }

  const content =
    'after' in event
      ? event.previously_known === false
        ? `**${escape(provider.display_name)}** · Provider discovered`
        : event.previously_known === true
          ? `**${escape(provider.display_name)}** has listed endpoints again.`
          : `**${escape(provider.display_name)}** now has listed endpoints.`
      : 'before' in event
        ? `**${escape(provider.display_name)}** has no more listed endpoints.`
        : [
            `**${escape(provider.display_name)}** · Updated`,
            ...changes.map((change) => fieldChange(change)),
          ].join('\n\n')

  return embedCard(content, {
    author: {
      name: provider.provider_id,
      url: gridUrl(provider.provider_id, urls),
      iconURL: logoUrl(provider.provider_id, urls),
    },
    timestamp: event.observed_at,
    color: 'after' in event ? colors.added : 'before' in event ? colors.removed : colors.updated,
  })
}

/** Match legacy provider alerts while retaining broader facts for other event consumers. */
function providerChanges(changes: FieldChange[]): FieldChange[] {
  const fields = new Set([
    'provider_id',
    'displayName',
    'headquarters',
    'datacenters',
    'statusPageUrl',
    'dataPolicy.termsOfServiceURL',
    'dataPolicy.privacyPolicyURL',
  ])

  return changes.flatMap<FieldChange>((change) => {
    if (fields.has(change.path)) {
      return [change]
    }

    if (change.path !== 'dataPolicy' || change.type === 'set_updated') {
      return []
    }

    // A whole policy object can arrive or disappear; project only its URL children.
    return ['dataPolicy.termsOfServiceURL', 'dataPolicy.privacyPolicyURL'].flatMap<FieldChange>(
      (path) => {
        const before = 'before' in change ? fact({ dataPolicy: change.before }, path) : undefined
        const after = 'after' in change ? fact({ dataPolicy: change.after }, path) : undefined

        if (before === after) {
          return []
        }

        if (after === undefined) {
          return before === undefined ? [] : [{ type: 'field_removed', path, before }]
        }

        return before === undefined
          ? [{ type: 'field_added', path, after }]
          : [{ type: 'field_updated', path, before, after }]
      },
    )
  })
}
