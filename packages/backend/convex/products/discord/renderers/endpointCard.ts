import type { AlertChange, AlertFact, EntityAlert } from '../../shared/alerts/curate'
import { embedCard, gridUrl, lifecycleColor, logoUrl } from './card'
import type { Card, DiscordUrls } from './card'
import { arrival, escape, lifecycleMarker } from './display'
import { factsText, fieldChange, fieldName } from './fields'
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

  return 'after' in event ? endpointDetails(event.after, event.pricing_is_scheduled) : []
}

function endpointChanges(changes: AlertChange[]): string[] {
  const prices = changes.filter((change) => change.field.startsWith('pricing.'))

  const fields = Map.groupBy(
    changes.filter((change) => !change.field.startsWith('pricing.')),
    (change) => fieldGroup(change.field),
  )

  const groups = [
    { label: 'Pricing', rows: pricingChanges(prices) },
    ...['Limits', 'Data policy', 'Details'].map((label) => ({
      label,
      rows: (fields.get(label) ?? []).map(endpointFieldChange),
    })),
  ].filter((group) => group.rows.length > 0)

  return groups.map(({ label, rows }) =>
    groups.length > 1 ? `◇ **${label}**\n${rows.join('\n')}` : rows.join('\n\n'),
  )
}

function fieldGroup(name: string): string {
  if (name.startsWith('data_policy.')) {
    return 'Data policy'
  }

  return /^(?:context_length|max_|limit_)/u.test(name) ? 'Limits' : 'Details'
}

/** Keep endpoint labels and units consistent across individual and batch cards. */
export function endpointFieldChange(change: AlertChange): string {
  return fieldChange(change, { label: endpointLabel(change.field), suffix: unit(change.field) })
}

function endpointDetails(facts: readonly AlertFact[], scheduled: boolean | undefined): string[] {
  return [
    factsText(facts, ['context_length', 'max_completion_tokens', 'quantization'], {
      label: endpointLabel,
    }),
    pricingFacts(facts, scheduled),
    factsText(
      facts,
      ['data_policy.training', 'data_policy.retains_prompts', 'data_policy.retention_days'],
      { suffix: unit },
    ),
  ].filter(Boolean)
}

function endpointLabel(name: string): string {
  return name === 'max_completion_tokens' ? 'max_output' : fieldName(name)
}

const unit = (name: string) => (name === 'data_policy.retention_days' ? ' days' : '')
