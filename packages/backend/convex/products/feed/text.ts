import { formatNumber, formatPercent, formatPrice, relativeChange } from '../../numbers'
import type { EntityAlert, FieldChange, FieldValue } from '../shared/alerts/curate'
import { fact } from '../shared/alerts/facts'
import { priceMeters } from '../shared/alerts/pricing'

const labels: Record<string, string> = {
  'pricing.prompt': 'Input price',
  'pricing.completion': 'Output price',
  'pricing.input_cache_read': 'Cache-read price',
  'pricing.input_cache_write': 'Cache-write price',
  'pricing.input_cache_write_1h': 'Cache-write 1h price',
  'pricing.discount': 'Discount',
  'pricing.overrides': 'Price schedule',
  short_name: 'Name',
  displayName: 'Name',
  provider_display_name: 'Provider name',
  description: 'Description',
  input_modalities: 'Input modalities',
  output_modalities: 'Output modalities',
  knowledge_cutoff: 'Knowledge cutoff',
  headquarters: 'Headquarters',
  datacenters: 'Datacenters',
  statusPageUrl: 'Status page',
  context_length: 'Context length',
  max_completion_tokens: 'Maximum completion tokens',
  max_prompt_tokens: 'Maximum prompt tokens',
  max_tokens_per_image: 'Maximum tokens per image',
  max_prompt_images: 'Maximum images per prompt',
  limit_rpm: 'Requests per minute',
  limit_rpd: 'Requests per day',
  quantization: 'Quantization',
  supported_parameters: 'Supported parameters',
  supports_reasoning: 'Reasoning support',
  has_completions: 'Completions support',
  has_chat_completions: 'Chat completions support',
  'features.supports_implicit_caching': 'Implicit caching support',
  'features.supports_native_web_search': 'Native web search support',
  moderation_required: 'Moderation required',
  is_disabled: 'Disabled',
  'data_policy.training': 'May train on data',
  'data_policy.canPublish': 'May publish data',
  'data_policy.requiresUserIDs': 'Shares user ID',
  'data_policy.retainsPrompts': 'May retain data',
  'data_policy.retentionDays': 'Data retention days',
}

function value(input: FieldValue, path: string): string {
  if (input === null) {
    return 'null'
  }

  if (typeof input === 'boolean') {
    return input ? 'yes' : 'no'
  }

  if (typeof input === 'number') {
    return (
      (path === 'pricing.discount' ? formatPercent(input) : formatNumber(input)) ?? String(input)
    )
  }

  const meter = priceMeters[path]

  if (typeof input === 'string' && meter !== undefined) {
    return formatPrice(input, meter.scale) ?? `$${input}`
  }

  if (Array.isArray(input)) {
    return input.map((item) => JSON.stringify(item)).join(', ') || '[]'
  }

  return JSON.stringify(input)
}

function describeChange(change: FieldChange): string[] {
  const name = labels[change.path] ?? change.path

  if (change.type === 'field_changed') {
    return [`${name} changed.`]
  }

  if (change.type === 'field_added') {
    return [`${name} was added: ${value(change.after, change.path)}.`]
  }

  if (change.type === 'field_removed') {
    return [`${name} was removed; previously ${value(change.before, change.path)}.`]
  }

  if (change.type === 'field_updated') {
    const before = value(change.before, change.path)
    const after = value(change.after, change.path)

    if (
      before === after &&
      ((typeof change.before === 'number' && typeof change.after === 'number') ||
        (priceMeters[change.path] !== undefined &&
          typeof change.before === 'string' &&
          typeof change.after === 'string'))
    ) {
      const delta = relativeChange(change.before, change.after)

      if (delta !== null) {
        return [
          `${name} is approximately ${after} (${delta.isUp ? 'increased' : 'decreased'} by ${delta.percent}).`,
        ]
      }
    }

    return [`${name} changed from ${before} to ${after}.`]
  }

  return [
    ...(change.added.length === 0 ? [] : [`${name} added: ${value(change.added, change.path)}.`]),
    ...(change.removed.length === 0
      ? []
      : [`${name} removed: ${value(change.removed, change.path)}.`]),
  ]
}

const describedPaths = {
  endpoint: [
    'pricing.prompt',
    'pricing.completion',
    'pricing.is_scheduled',
    'context_length',
    'max_completion_tokens',
    'quantization',
    'supported_parameters',
  ],
  model: [
    'description',
    'input_modalities',
    'output_modalities',
    'knowledge_cutoff',
    'supports_reasoning',
  ],
  provider: ['headquarters', 'datacenters', 'statusPageUrl'],
}

/** Plain-text items remain independent of a product's markup, grouping, and navigation. */
export function describe(event: EntityAlert): string[] {
  if ('changes' in event) {
    return event.changes.flatMap(describeChange)
  }

  const facts = 'after' in event ? event.after : event.before

  return describedPaths[event.entity_kind].flatMap((path) => {
    const field = fact(facts, path)

    if (path === 'pricing.is_scheduled') {
      return field === true ? ['Price schedule detected.'] : []
    }

    const name = labels[path] ?? path
    return field === undefined
      ? []
      : [`${name}${'before' in event ? ' when last observed' : ''}: ${value(field, path)}.`]
  })
}

function endpointListing(row: EntityAlert): string {
  if ('before' in row) {
    return 'is no longer listed'
  }
  if (row.previously_known === false) {
    return 'has a newly discovered endpoint'
  }
  return row.previously_known === true ? 'is relisted' : 'is now listed'
}

function parentState(row: EntityAlert): string {
  if ('changes' in row) {
    return 'has updated details'
  }
  if ('before' in row) {
    return 'has no more listed endpoints'
  }
  if (row.previously_known === false) {
    return 'was discovered with listed endpoints'
  }
  return row.entity_kind === 'provider' && row.previously_known === true
    ? 'has listed endpoints again'
    : 'now has listed endpoints'
}

export function summarize(row: EntityAlert): string {
  if (row.entity_kind === 'endpoint') {
    const { model, endpoint } = row.context
    const offering = `${endpoint.provider_display_name} (${endpoint.provider_tag})`

    return (
      'changes' in row
        ? `${model.display_name} on ${offering} has updated endpoint details.`
        : `${model.display_name} ${endpointListing(row)} on ${offering}.`
    ).replaceAll(/\s+/gu, ' ')
  }

  const subject =
    row.entity_kind === 'model'
      ? `Model ${row.context.model.display_name} (${row.entity_id})`
      : `Provider ${row.context.provider.display_name} (${row.entity_id})`

  return `${subject} ${parentState(row)}.`.replaceAll(/\s+/gu, ' ')
}
