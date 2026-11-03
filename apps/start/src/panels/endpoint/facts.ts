import type { EndpointRow } from '#endpoints/snapshot'
import { ABSENT, formatContext } from '#lib/format'
import { huggingFaceUrl } from '#lib/openrouter'

import { formatDate, formatFlag, formatList } from './labels'

/** One label and value in the panel. */
export interface FactRow {
  /** Stable React key within a section. */
  id: string
  label: string
  value: string
  /** Hover text. Backticks mark code. */
  description?: string
  /** Renders the value as an external link. */
  href?: string
  /** A detail of the row above it, set in from the label. */
  indent?: boolean
  /** A price. It never breaks across lines, and drops under a label too long to share a line. */
  rate?: boolean
  /** Reads in the foreground colour rather than muted, for detail beside the plain rates. */
  emphasis?: boolean
}

export interface Section {
  id: string
  title: string
  /** Shown on the right of the title: units or the statistic. */
  note?: string
  rows: FactRow[]
}

/** A link target shown as `host/path` without the scheme. */
export function linkText(url: string): string {
  try {
    const { host, pathname } = new URL(url)

    return `${host.replace(/^www\./u, '')}${pathname === '/' ? '' : pathname.replace(/\/$/u, '')}`
  } catch {
    return url
  }
}

function linkRow(id: string, label: string, url: string | null, description?: string): FactRow {
  const row: FactRow = { id, label, value: url === null ? ABSENT : linkText(url) }

  if (description !== undefined) {
    row.description = description
  }

  if (url !== null) {
    row.href = url
  }

  return row
}

/** Upstream states the cutoff as a timestamp or as text; a timestamp reads as its date. */
function formatCutoff(cutoff: string | null): string {
  if (cutoff === null) {
    return ABSENT
  }

  // Date parsing is lenient about prose such as `mid 2025`, so only ISO timestamps are read as dates.
  return /^\d{4}-\d{2}-\d{2}T/u.test(cutoff) ? formatDate(cutoff) : cutoff
}

/** Reasoning configuration rows the model states; unstated settings are left out. */
function reasoningRows({ model }: EndpointRow): FactRow[] {
  const config = model.reasoning_config

  const rows: FactRow[] = [
    { id: 'reasoning', label: 'Reasoning', value: formatFlag(model.supports_reasoning) },
  ]

  const stated: [string, string, string | null][] = [
    ['mandatory', 'Mandatory', flagOrNull(config.is_mandatory_reasoning)],
    ['default-enabled', 'On by default', flagOrNull(config.default_reasoning_enabled)],
    [
      'efforts',
      'Efforts',
      config.supported_reasoning_efforts === null
        ? null
        : formatList(config.supported_reasoning_efforts),
    ],
    ['default-effort', 'Default effort', config.default_reasoning_effort],
    ['budget', 'Token budget', flagOrNull(config.supports_reasoning_max_tokens)],
    ['returned', 'Returned as', config.reasoning_return_mechanism],
  ]

  for (const [id, label, value] of stated) {
    if (value !== null) {
      rows.push({ id, label, value })
    }
  }

  return rows
}

const flagOrNull = (flag: boolean | null) => (flag === null ? null : formatFlag(flag))

/** The Model tab's facts: what holds for the model whichever provider serves it. */
export function modelRows(row: EndpointRow): FactRow[] {
  const { model } = row

  return [
    { id: 'name', label: 'Name', value: model.name },
    { id: 'id', label: 'ID', value: model.id },
    { id: 'author', label: 'Author', value: model.author.name ?? model.author.id },
    { id: 'released', label: 'Released', value: formatDate(model.created_at) },
    {
      description: 'Context length of this endpoint.',
      id: 'context',
      label: 'Context',
      value: formatContext(row.context),
    },
    { id: 'input', label: 'Input', value: formatList(model.input_modalities) },
    { id: 'output', label: 'Output', value: formatList(model.output_modalities) },
    ...reasoningRows(row),
    { id: 'cutoff', label: 'Knowledge cutoff', value: formatCutoff(model.knowledge_cutoff) },
    model.hf_slug === null
      ? { id: 'weights', label: 'Open weights', value: 'no' }
      : linkRow(
          'weights',
          'Open weights',
          huggingFaceUrl(model.hf_slug),
          'Weights are published on Hugging Face.',
        ),
  ]
}

/** The Provider tab's facts. */
export function providerRows({ provider }: EndpointRow): FactRow[] {
  return [
    { id: 'name', label: 'Name', value: provider.name },
    { id: 'headquarters', label: 'Headquarters', value: provider.headquarters ?? ABSENT },
    { id: 'datacenters', label: 'Datacenters', value: formatList(provider.datacenters) },
    linkRow('status', 'Status page', provider.status_page_url),
    linkRow('privacy', 'Privacy policy', provider.privacy_policy_url),
    linkRow('terms', 'Terms of service', provider.terms_of_service_url),
    { id: 'byok', label: 'BYOK', value: formatFlag(provider.byok_enabled) },
    { id: 'listed-endpoints', label: 'Listed endpoints', value: String(provider.listed_endpoints) },
    { id: 'listed-models', label: 'Listed models', value: String(provider.listed_models) },
  ]
}
