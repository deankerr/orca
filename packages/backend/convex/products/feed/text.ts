import type { AlertChange, AlertFact, EntityAlert } from '../shared/alerts/curate'
import { formatQuantity, isQuantity, presentChange } from '../shared/alerts/present'

interface Labels {
  [field: string]: string
}

const labels: Labels = {
  context_length: 'Context length',
  'data_policy.can_publish': 'May publish data',
  'data_policy.requires_user_ids': 'Shares user ID',
  'data_policy.retains_prompts': 'May retain data',
  'data_policy.retention_days': 'Data retention days',
  'data_policy.training': 'May train on data',
  datacenters: 'Datacenters',
  description: 'Description',
  display_name: 'Display name',
  has_chat_completions: 'Chat completions support',
  has_completions: 'Completions support',
  headquarters: 'Headquarters',
  input_modalities: 'Input modalities',
  is_disabled: 'Disabled',
  knowledge_cutoff: 'Knowledge cutoff',
  label: 'Provider name',
  limit_rpd: 'Requests per day',
  limit_rpm: 'Requests per minute',
  max_completion_tokens: 'Maximum completion tokens',
  max_prompt_tokens: 'Maximum prompt tokens',
  max_tokens_per_image: 'Maximum tokens per image',
  moderation_required: 'Moderation required',
  name: 'Name',
  output_modalities: 'Output modalities',
  'pricing.discount': 'Discount',
  'pricing.input': 'Input price',
  'pricing.input_cache_read': 'Cache-read price',
  'pricing.input_cache_write': 'Cache-write price',
  'pricing.input_cache_write_1h': 'Cache-write 1h price',
  'pricing.output': 'Output price',
  'pricing.overrides': 'Price schedule',
  quantization: 'Quantization',
  status_page_url: 'Status page',
  supported_parameters: 'Supported parameters',
  supports_native_web_search: 'Native web search support',
  supports_reasoning: 'Reasoning support',
}

function value(item: AlertFact): string {
  if (item.value === null) {
    return 'null'
  }

  if (item.kind === 'flag') {
    return item.value ? 'yes' : 'no'
  }

  if (isQuantity(item)) {
    return formatQuantity(item)
  }

  if (item.kind === 'list') {
    return item.value.map((member) => JSON.stringify(member)).join(', ') || '[]'
  }

  return JSON.stringify(item.value)
}

const members = (field: string, items: string[]) => value({ field, kind: 'list', value: items })

function describeChange(change: AlertChange): string[] {
  const name = labels[change.field] ?? change.field
  const presented = presentChange(change)

  if (presented.transition === 'opaque') {
    return [`${name} changed.`]
  }

  if (presented.transition === 'members') {
    return [
      ...(presented.added.length === 0
        ? []
        : [`${name} added: ${members(change.field, presented.added)}.`]),
      ...(presented.removed.length === 0
        ? []
        : [`${name} removed: ${members(change.field, presented.removed)}.`]),
    ]
  }

  if (presented.transition === 'added') {
    return [`${name} was added: ${value(presented.fact)}.`]
  }

  if (presented.transition === 'removed') {
    return [`${name} was removed; previously ${value(presented.fact)}.`]
  }

  const { before, after, movement } = presented

  if (movement !== null && value(before) === value(after)) {
    return [
      `${name} is approximately ${value(after)} (${movement.isUp ? 'increased' : 'decreased'} by ${movement.percent}).`,
    ]
  }

  return [`${name} changed from ${value(before)} to ${value(after)}.`]
}

const describedFields = {
  endpoint: [
    'pricing.input',
    'pricing.output',
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
  provider: ['headquarters', 'datacenters', 'status_page_url'],
}

/** Plain-text items remain independent of a product's markup, grouping, and navigation. */
export function describe(event: EntityAlert): string[] {
  if ('changes' in event) {
    return event.changes.flatMap(describeChange)
  }

  const facts = 'after' in event ? event.after : event.before
  const observed = 'before' in event ? ' when last observed' : ''

  return [
    ...describedFields[event.entity_kind].flatMap((field) => {
      const item = facts.find((candidate) => candidate.field === field)

      // Unknown facts have nothing to describe.
      return item === undefined || item.value === null
        ? []
        : [`${labels[field] ?? field}${observed}: ${value(item)}.`]
    }),
    ...(event.pricing_is_scheduled === true ? ['Price schedule detected.'] : []),
  ]
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
