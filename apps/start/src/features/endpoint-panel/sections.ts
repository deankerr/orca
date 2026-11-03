import { properties } from '@orca/properties'
import type { Group, PropertyId, Value } from '@orca/properties'

import type { EndpointRow } from '#features/endpoints/rows'
import { ABSENT } from '#features/table/format'

import {
  formatDate,
  formatDays,
  formatFlag,
  formatTokens,
  formatValue,
  sentenceCase,
} from './format'
import { pricingRows } from './pricing'
import type { FactRow, Section } from './rows'

/** The groups with a section of their own, in order; every other endpoint property goes to More. */
const CURATED_GROUPS = [
  'data-policy',
  'tools',
  'output',
  'reasoning',
] as const satisfies readonly Group[]

const SECTION_TITLES: Record<(typeof CURATED_GROUPS)[number], string> = {
  'data-policy': 'Data policy',
  output: 'Output',
  reasoning: 'Reasoning',
  tools: 'Tools',
}

/** Groups More leaves out: shown in other sections, other tabs, or the header. */
const OTHER_HOMES: readonly Group[] = ['modality', 'pricing']

/** Properties shown in the header, or as a row elsewhere, rather than in More. */
const NOT_IN_MORE: ReadonlySet<PropertyId> = new Set(['region', 'service_tier', 'unlisted'])

/** Own label or wording for a property, where its name alone would mislead in its section. */
const wording: Partial<Record<PropertyId, { label?: string; value?: string }>> = {
  byok_only: { label: 'BYOK only' },
  completions: { label: 'Completions API' },
  deranked: { label: 'Routing', value: 'fallback only' },
  disabled: { label: 'Status', value: 'disabled' },
  new_endpoint: { label: 'New' },
  no_abort: { label: 'Cancellation', value: 'no abort' },
  reasoning_budget: { label: 'Token budget' },
  reasoning_default_effort: { label: 'Default effort' },
  reasoning_default_off: { label: 'Default', value: 'off' },
  reasoning_effort: { label: 'Effort' },
  reasoning_hidden: { label: 'Returned', value: 'no' },
  reasoning_mandatory: { label: 'Mandatory' },
}

/** A property's value in the panel; a few carry a price or date rather than plain text. */
function propertyValue(id: PropertyId, value: Value | true): string {
  if (value === true || id === 'native_web_search') {
    return wording[id]?.value ?? formatValue(true)
  }

  if (id === 'deprecating') {
    return formatDate(String(value))
  }

  return id === 'prompt_retention' ? formatDays(Number(value)) : formatValue(value)
}

/**
 * A property's description in the panel. Native web search's own says the value is a price; here
 * the price is under Pricing, so the row reads `yes`.
 */
function propertyDescription(id: PropertyId, value: Value | true): string {
  const { description } = properties[id]

  if (id !== 'native_web_search') {
    return description
  }

  return value === true
    ? 'The provider runs web search itself.'
    : 'The provider runs web search itself. Its price per search is under Pricing.'
}

function propertyRow(id: PropertyId, value: Value | true): FactRow {
  const { name } = properties[id]

  return {
    description: propertyDescription(id, value),
    id,
    label: wording[id]?.label ?? sentenceCase(name),
    value: propertyValue(id, value),
  }
}

/** Rows for the active properties matching a test, in property definition order. */
function activeRows(row: EndpointRow, matches: (id: PropertyId) => boolean): FactRow[] {
  return [...row.properties].flatMap(([id, value]) => (matches(id) ? [propertyRow(id, value)] : []))
}

const inGroup = (group: Group) => (id: PropertyId) => properties[id].group === group

function contractRow(id: PropertyId, label: string, value: string): FactRow {
  return { description: properties[id].description, id, label, value }
}

/** Prompt retention from the policy: `none`, a period, or `yes` when the period is not stated. */
function retention({ endpoint }: EndpointRow): string {
  const { retains_prompts: retains, retention_days: days } = endpoint.data_policy

  if (retains === null) {
    return ABSENT
  }

  if (!retains) {
    return 'none'
  }

  return days === null ? 'yes' : formatDays(days)
}

function dataPolicyRows(row: EndpointRow): FactRow[] {
  const { endpoint } = row
  const { requires_user_ids: userIds, training } = endpoint.data_policy

  const facts: ReadonlySet<PropertyId> = new Set([
    'zdr',
    'prompt_retention',
    'training',
    'user_id_required',
  ])

  return [
    contractRow('zdr', 'ZDR', formatFlag(endpoint.is_zdr)),
    contractRow('prompt_retention', 'Prompt retention', retention(row)),
    contractRow('training', 'Training', formatFlag(training)),
    contractRow('user_id_required', 'User ID required', formatFlag(userIds)),
    ...activeRows(row, (id) => inGroup('data-policy')(id) && !facts.has(id)),
  ]
}

const FORMATS = [
  ['response_format', 'json'],
  ['structured_outputs', 'json schema'],
] as const satisfies readonly (readonly [PropertyId, string])[]

function outputRows(row: EndpointRow): FactRow[] {
  const rows: FactRow[] = []
  const { max_completion_tokens: maxOutput } = row.endpoint

  if (maxOutput !== null) {
    rows.push({
      description: 'Maximum output tokens per response.',
      id: 'max_output',
      label: 'Max output',
      value: formatTokens(maxOutput),
    })
  }

  const formats = FORMATS.filter(([id]) => row.properties.has(id))

  if (formats.length > 0) {
    rows.push({
      description: formats.map(([id]) => properties[id].description).join(' '),
      id: 'formats',
      label: 'Formats',
      value: formats.map(([, text]) => text).join(', '),
    })
  }

  const formatIds: ReadonlySet<PropertyId> = new Set(FORMATS.map(([id]) => id))

  return [...rows, ...activeRows(row, (id) => inGroup('output')(id) && !formatIds.has(id))]
}

/** Endpoint properties no other section covers; the many accepted-parameter flags collapse to one row. */
function moreRows(row: EndpointRow): FactRow[] {
  const homes: ReadonlySet<Group> = new Set([...CURATED_GROUPS, ...OTHER_HOMES])

  const isFlagParameter = (id: PropertyId) =>
    properties[id].group === 'parameter' && properties[id].kind === 'flag'

  const rows = activeRows(row, (id) => {
    const { entity, group } = properties[id]

    return (
      entity === 'endpoint' && !homes.has(group) && !NOT_IN_MORE.has(id) && !isFlagParameter(id)
    )
  })

  const accepted = [...row.properties.keys()].filter(isFlagParameter)

  if (accepted.length > 0) {
    rows.push({
      description: 'Request parameters this endpoint accepts, beyond tools and output formats.',
      id: 'parameters',
      label: 'Parameters',
      value: accepted.map((id) => properties[id].name).join(', '),
    })
  }

  return rows
}

/** The Endpoint tab's sections, in order; a section with no rows is left out. */
export function endpointSections(row: EndpointRow): Section[] {
  const { throughput, latency } = row

  const sections: Section[] = [
    {
      id: 'pricing',
      note: '$/M tokens',
      rows: pricingRows(row.endpoint.pricing, {
        nativeWebSearch: row.properties.has('native_web_search'),
      }),
      title: 'Pricing',
    },
    {
      id: 'speed',
      note: 'p50',
      rows: [
        {
          description: 'Median output speed.',
          id: 'throughput',
          label: 'Tokens/sec',
          value: formatTokens(throughput === null ? null : Math.round(throughput)),
        },
        {
          description: 'Median time to first token.',
          id: 'latency',
          label: 'Latency',
          value: latency === null ? ABSENT : `${formatTokens(Math.round(latency))} ms`,
        },
      ],
      title: 'Speed',
    },
    { id: 'data-policy', rows: dataPolicyRows(row), title: SECTION_TITLES['data-policy'] },
    { id: 'tools', rows: activeRows(row, inGroup('tools')), title: SECTION_TITLES.tools },
    { id: 'output', rows: outputRows(row), title: SECTION_TITLES.output },
    {
      id: 'reasoning',
      rows: activeRows(row, inGroup('reasoning')),
      title: SECTION_TITLES.reasoning,
    },
    { id: 'more', rows: moreRows(row), title: 'More' },
  ]

  return sections.filter(({ rows }) => rows.length > 0)
}
