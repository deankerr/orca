import type { EntityAlert, FieldChange, FieldValue } from '../../shared/alerts/curate'
import { embedCard, gridUrl, lifecycleColor, logoUrl } from './card'
import type { Card, DiscordUrls } from './card'
import { arrival, escape, lifecycleMarker } from './display'
import { factsText, fieldChange, fieldName, fieldValue } from './fields'
import { pricingChanges, pricingFacts } from './pricing'

type EndpointAlert = Extract<EntityAlert, { entity_kind: 'endpoint' }>

/** Endpoint identity, field layout, and lifecycle presentation belong to this card. */
export function endpointCard(event: EndpointAlert, urls: DiscordUrls): Card {
  const { model, provider, endpoint } = event.context
  const prefix = event.entity_id.slice(0, 6)
  const url = gridUrl(model.model_id, urls, prefix)

  const heading = `${lifecycleMarker(event)}**${escape(endpoint.provider_display_name)}** endpoint ${endpointState(event)}.`

  return embedCard([heading, ...endpointBody(event)].filter(Boolean).join('\n\n'), {
    author: { iconURL: logoUrl(model.model_id, urls), name: `${model.model_id} [${prefix}]`, url },
    color: lifecycleColor(event),
    footer: { iconURL: logoUrl(provider.provider_id, urls), text: endpoint.provider_tag },
    timestamp: event.observed_at,
  })
}

function endpointState(event: EndpointAlert): string {
  if ('after' in event) {
    return arrival(event.previously_known)
  }

  return 'before' in event ? 'unlisted' : 'updated'
}

function endpointBody(event: EndpointAlert): string[] {
  if ('changes' in event) {
    return endpointChanges(event.changes)
  }

  return 'after' in event ? endpointDetails(event.after) : []
}

function endpointChanges(changes: FieldChange[]): string[] {
  const prices = changes.filter((change) => change.path.startsWith('pricing.'))

  const fields = changes.filter((change) => !change.path.startsWith('pricing.'))

  const groups = [
    { label: 'Pricing', rows: pricingChanges(prices) },
    ...['Limits', 'Data policy', 'Details'].map((label) => ({
      label,
      rows: fields.filter((change) => fieldGroup(change.path) === label).map(endpointFieldChange),
    })),
  ].filter((group) => group.rows.length > 0)

  return groups.map(({ label, rows }) =>
    groups.length > 1 ? `◇ **${label}**\n${rows.join('\n')}` : rows.join('\n\n'),
  )
}

function fieldGroup(path: string): string {
  if (path.startsWith('data_policy.')) {
    return 'Data policy'
  }

  return /^(?:context_length|max_|limit_)/u.test(path) ? 'Limits' : 'Details'
}

/** Keep endpoint labels and units consistent across individual and batch cards. */
export function endpointFieldChange(change: FieldChange): string {
  return fieldChange(change, { formatValue: endpointValue, label: endpointLabel(change.path) })
}

function endpointDetails(facts: Record<string, FieldValue>): string[] {
  return [
    factsText(facts, ['context_length', 'max_completion_tokens', 'quantization'], {
      label: endpointLabel,
    }),
    pricingFacts(facts),
    factsText(
      facts,
      ['data_policy.training', 'data_policy.retainsPrompts', 'data_policy.retentionDays'],
      { formatValue: endpointValue },
    ),
  ].filter(Boolean)
}

function endpointLabel(path: string): string {
  return path === 'max_completion_tokens' ? 'max_output' : fieldName(path)
}

function endpointValue(value: FieldValue, path: string): string {
  return fieldValue(value, { suffix: path === 'data_policy.retentionDays' ? ' days' : '' })
}
