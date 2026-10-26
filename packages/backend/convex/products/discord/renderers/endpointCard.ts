import type { AlertChange, AlertFact, EntityAlert } from '../../shared/alerts/curate'
import { findFact, formatQuantity } from '../../shared/alerts/present'
import { embedCard, gridUrl, lifecycleColor, logoUrl } from './card'
import type { Card, DiscordUrls } from './card'
import { arrival, bulletList, dot, escape, lifecycleMarker, stackRows } from './display'
import { fieldChange } from './fields'
import { pricingChanges, pricingSummary } from './pricing'

type EndpointAlert = Extract<EntityAlert, { entity_kind: 'endpoint' }>

/** Endpoint identity, field layout, and lifecycle presentation belong to this card. */
export function endpointCard(event: EndpointAlert, urls: DiscordUrls): Card {
  const { model, provider, endpoint } = event.context
  const prefix = event.entity_id.slice(0, 6)
  const url = gridUrl(model.model_id, urls, prefix)

  // The UUID prefix names the endpoint among its provider's offerings and matches the grid link.
  const heading = `${lifecycleMarker(event)}**${escape(endpoint.provider_display_name)}** endpoint (${prefix}) ${endpointState(event)}.`

  return embedCard([heading, ...endpointBody(event)].filter(Boolean).join('\n\n'), {
    author: { iconURL: logoUrl(model.model_id, urls), name: model.model_id, url },
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
    { changeRows: pricingChanges(prices), label: 'Pricing' },
    ...['Limits', 'Data policy', 'Details'].map((label) => ({
      changeRows: (fields.get(label) ?? []).map(endpointFieldChange),
      label,
    })),
  ].filter((group) => group.changeRows.length > 0)

  return groups.map(({ label, changeRows }) =>
    groups.length > 1 ? `◇ **${label}**\n${stackRows(changeRows)}` : stackRows(changeRows),
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
  return fieldChange(change, { suffix: unit(change.field) })
}

/** Listings summarize facts as bullet lists; the grid link carries the full presentation. */
function endpointDetails(facts: readonly AlertFact[], scheduled: boolean | undefined): string[] {
  const limits = [limitsSummary(facts), quantizationSummary(facts)].filter(Boolean).join(dot)
  const policy = policySummary(facts).filter(Boolean).join(dot)

  // Data policy is a separate list, so it reads apart from limits and prices.
  return [
    bulletList([
      limits,
      ...pricingSummary(facts),
      scheduled === true ? 'Price schedule detected.' : '',
    ]),
    bulletList([policy]),
  ].filter(Boolean)
}

/** `**Context** 262K (65K)`, with the output limit in parentheses. */
function limitsSummary(facts: readonly AlertFact[]): string {
  const tokens = (name: string) => {
    const value = findFact(facts, name, 'count')?.value

    return value === undefined || value === null ? undefined : compactCount(value)
  }

  const [context, output] = [tokens('context_length'), tokens('max_completion_tokens')]

  if (context === undefined) {
    return output === undefined ? '' : `**Max output** ${output}`
  }

  return output === undefined ? `**Context** ${context}` : `**Context** ${context} (${output})`
}

function quantizationSummary(facts: readonly AlertFact[]): string {
  const quantization = findFact(facts, 'quantization', 'text')?.value

  return quantization === undefined || quantization === null || quantization === 'unknown'
    ? ''
    : escape(quantization.toUpperCase())
}

/** Only affirmative policies are worth a line; false and unknown flags are omitted. */
function policySummary(facts: readonly AlertFact[]): string[] {
  const flag = (name: string) => findFact(facts, name, 'flag')?.value === true
  const retention = findFact(facts, 'data_policy.retention_days', 'count')

  const days =
    retention === undefined || retention.value === null
      ? ''
      : `: ${formatQuantity(retention)}${unit(retention.field)}`

  return [
    flag('data_policy.training') ? 'Trains on prompts' : '',
    flag('data_policy.retains_prompts') ? `Retains prompts${days}` : '',
  ]
}

/** Token limits read at a glance: 262,144 is 262K and 65,536 is 65K; limits never round up. */
const compactCount = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value < 1_000_000 ? 0 : 2,
    notation: 'compact',
    roundingMode: 'floor',
  }).format(value)

const unit = (name: string) => (name === 'data_policy.retention_days' ? ' days' : '')
