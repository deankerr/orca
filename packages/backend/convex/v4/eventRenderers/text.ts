import type { EventRow } from '../events/query'
import type { CuratedEvent, FieldChange, FieldValue } from './curate'
import { formatNumber, formatPercent, formatPrice, relativeChange } from './numbers'

const labels: Record<string, string> = {
  'pricing.prompt': 'Input price',
  'pricing.completion': 'Output price',
  'pricing.input_cache_read': 'Cache-read price',
  'pricing.input_cache_write': 'Cache-write price',
  'pricing.input_cache_write_1h': 'Cache-write 1h price',
  'pricing.discount': 'Discount',
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

const tokenPrices = new Set([
  'pricing.prompt',
  'pricing.completion',
  'pricing.input_cache_read',
  'pricing.input_cache_write',
  'pricing.input_cache_write_1h',
])

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

  if (typeof input === 'string' && tokenPrices.has(path)) {
    return formatPrice(input, 6) ?? `$${input}`
  }

  if (Array.isArray(input)) {
    return input.map((item) => JSON.stringify(item)).join(', ') || '[]'
  }

  return JSON.stringify(input)
}

function describeChange(change: FieldChange): string[] {
  const name = labels[change.path] ?? change.path

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
        (tokenPrices.has(change.path) &&
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

/** Plain-text items remain independent of a product's markup, grouping, and navigation. */
export function describe(event: CuratedEvent): string[] {
  if ('changes' in event) {
    return event.changes.flatMap(describeChange)
  }

  const facts = 'after' in event ? event.after : event.before

  const paths =
    event.entity_kind === 'endpoint'
      ? [
          'pricing.prompt',
          'pricing.completion',
          'context_length',
          'max_completion_tokens',
          'quantization',
          'supported_parameters',
        ]
      : event.entity_kind === 'model'
        ? [
            'description',
            'input_modalities',
            'output_modalities',
            'knowledge_cutoff',
            'supports_reasoning',
          ]
        : ['headquarters', 'datacenters', 'statusPageUrl']
  return paths.flatMap((path) => {
    const [key, child] = path.split('.')
    const parent = facts[key ?? '']

    const field =
      child === undefined
        ? parent
        : parent !== null && typeof parent === 'object' && !Array.isArray(parent)
          ? parent[child]
          : undefined

    const name = labels[path] ?? path
    return field === undefined
      ? []
      : [`${name}${'before' in event ? ' when last observed' : ''}: ${value(field, path)}.`]
  })
}

export function summarize(row: EventRow): string {
  if (row.entity_kind === 'endpoint') {
    const { model, endpoint } = row.context
    const offering = `${endpoint.provider_display_name} (${endpoint.provider_tag})`

    const listing =
      row.type === 'REMOVE'
        ? 'is no longer listed'
        : row.previously_known === false
          ? 'has a newly discovered endpoint'
          : row.previously_known === true
            ? 'is relisted'
            : 'is now listed'

    return (
      row.type === 'UPDATE'
        ? `${model.display_name} on ${offering} has updated endpoint details.`
        : `${model.display_name} ${listing} on ${offering}.`
    ).replaceAll(/\s+/g, ' ')
  }

  const subject =
    row.entity_kind === 'model'
      ? `Model ${row.context.model.display_name} (${row.entity_id})`
      : `Provider ${row.context.provider.display_name} (${row.entity_id})`

  const state =
    row.type === 'UPDATE'
      ? 'has updated details'
      : row.type === 'REMOVE'
        ? 'has no more listed endpoints'
        : row.previously_known === false
          ? 'was discovered with listed endpoints'
          : row.entity_kind === 'provider' && row.previously_known === true
            ? 'has listed endpoints again'
            : 'now has listed endpoints'

  return `${subject} ${state}.`.replaceAll(/\s+/g, ' ')
}
