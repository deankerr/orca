import type { CuratedEvent, FieldChange, FieldValue } from '../curate'
import { colors, embedCard, gridUrl, logoUrl } from './card'
import type { Card, DiscordUrls } from './card'
import { escape, lifecycleMarker } from './display'
import { factsText, fieldChange, fieldName, fieldValue } from './fields'
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
        ? 'discovered'
        : event.previously_known === true
          ? 'relisted'
          : 'listed'
      : 'before' in event
        ? 'unlisted'
        : 'updated'

  const heading = `${lifecycleMarker(event)}**${escape(endpoint.provider_display_name)}** endpoint ${state}.`

  const body =
    'changes' in event
      ? endpointChanges(event.changes)
      : 'after' in event
        ? endpointDetails(event.after)
        : []

  if ('changes' in event && body.length === 0) {
    return null
  }

  return embedCard([heading, ...body].filter(Boolean).join('\n\n'), {
    author: { name: `${model.model_id} [${prefix}]`, url, iconURL: logoUrl(model.model_id, urls) },
    timestamp: event.observed_at,
    color: 'after' in event ? colors.added : 'before' in event ? colors.removed : colors.updated,
    footer: { text: endpoint.provider_tag, iconURL: logoUrl(provider.provider_id, urls) },
  })
}

function endpointChanges(changes: FieldChange[]): string[] {
  const prices = changes.filter((change) => change.path.startsWith('pricing.'))

  const fields = changes.filter((change) => !change.path.startsWith('pricing.'))

  const groups = [
    { label: 'Pricing', rows: pricingChanges(prices) },
    ...['Limits', 'Data policy', 'Details'].map((label) => ({
      label,
      rows: fields
        .filter((change) => {
          const group = change.path.startsWith('data_policy.')
            ? 'Data policy'
            : /^(?:context_length|max_|limit_)/.test(change.path)
              ? 'Limits'
              : 'Details'

          return group === label
        })
        .map((change) =>
          fieldChange(change, { label: endpointLabel(change.path), formatValue: endpointValue }),
        ),
    })),
  ].filter((group) => group.rows.length > 0)

  return groups.map(({ label, rows }) =>
    groups.length > 1 ? `◇ **${label}**\n${rows.join('\n')}` : rows.join('\n\n'),
  )
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
