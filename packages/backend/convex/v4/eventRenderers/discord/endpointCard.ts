import type { CuratedEvent, FieldChange, FieldValue } from '../curate'
import { colors, embedCard, gridUrl, logoUrl } from './card'
import type { Card, DiscordUrls } from './card'
import { code, escape, field } from './display'
import { fact, factsText, fieldChange, fieldValue } from './fields'
import { pricingChanges, pricingFacts } from './pricing'

/** Endpoint identity, field selection, and lifecycle facts belong to this card alone. */
export function endpointCard(event: CuratedEvent, urls: DiscordUrls): Card | null {
  if (event.entity_kind !== 'endpoint') {
    return null
  }

  const { model, provider, endpoint } = event.context
  const prefix = event.entity_id.slice(0, 6)
  const url = gridUrl(model.model_id, urls, prefix)

  const state =
    'after' in event
      ? event.previously_known === false
        ? 'Discovered'
        : event.previously_known === true
          ? 'Relisted'
          : 'Listed'
      : 'before' in event
        ? 'Unlisted'
        : 'Updated'

  const heading = `**${escape(endpoint.provider_display_name)}** · ${state}\n[${code(prefix)}](${url})`

  const body =
    'changes' in event
      ? endpointChanges(event.changes)
      : endpointDetails('after' in event ? event.after : event.before, 'before' in event)

  if ('changes' in event && body.length === 0) {
    return null
  }

  return embedCard([heading, ...body].filter(Boolean).join('\n\n'), {
    author: { name: model.model_id, url, iconURL: logoUrl(model.model_id, urls) },
    timestamp: event.observed_at,
    color: 'after' in event ? colors.added : 'before' in event ? colors.removed : colors.updated,
    footer: { text: endpoint.provider_tag, iconURL: logoUrl(provider.provider_id, urls) },
  })
}

function endpointChanges(changes: FieldChange[]): string[] {
  const prices = changes.filter((change) => change.path.startsWith('pricing.'))

  const fields = changes.filter(
    (change) => !change.path.startsWith('pricing.') && change.path !== 'supports_reasoning',
  )

  return [
    ...pricingChanges(prices),
    ...fields.map((change) => fieldChange(change, { formatValue: endpointValue })),
  ]
}

function endpointDetails(facts: Record<string, FieldValue>, removed: boolean): string[] {
  const parameters = fact(facts, 'supported_parameters')

  return [
    removed ? 'Last known endpoint details:' : '',
    factsText(facts, ['context_length', 'max_completion_tokens', 'quantization']),
    pricingFacts(facts),
    Array.isArray(parameters) && parameters.length > 0
      ? field('supported_parameters', fieldValue(parameters), { layout: 'block' })
      : '',
    factsText(
      facts,
      ['data_policy.training', 'data_policy.retainsPrompts', 'data_policy.retentionDays'],
      endpointValue,
    ),
  ].filter(Boolean)
}

function endpointValue(value: FieldValue, path: string): string {
  return fieldValue(value, { suffix: path === 'data_policy.retentionDays' ? ' days' : '' })
}
