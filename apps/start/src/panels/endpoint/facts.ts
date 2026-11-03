import type { EndpointRow } from '#endpoints/snapshot'
import { ABSENT, formatContext } from '#lib/format'
import { huggingFaceUrl, modelPageUrl, providerPageUrl } from '#lib/openrouter'

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
  /** The accessible name of a button that copies the value, as `Copy model ID`. */
  copyLabel?: string
  /** A list too long for the label's line: the label stands alone and these wrap under it as chips. */
  items?: string[]
}

export interface Section {
  id: string
  title: string
  /** Shown on the right of the title: units or the statistic. */
  note?: string
  /** Pages shown as links of their own, above the rows. */
  links?: string[]
  /** Prose under the title, clamped to a few lines. */
  text?: string
  rows: FactRow[]
}

/** A link target shown as its hostname alone: `huggingface.co`. The full URL belongs in a tooltip. */
export function linkText(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, '')
  } catch {
    return url
  }
}

/** Lists of this many items or more no longer share a line with their label. */
const STACK_FROM = 4

/** A list value: on the label's line while it is short, as chips under the label once it is long. */
export function listRow(
  id: string,
  label: string,
  list: readonly string[] | null,
  description?: string,
): FactRow {
  const row: FactRow = { id, label, value: formatList(list) }

  if (description !== undefined) {
    row.description = description
  }

  if (list !== null && list.length >= STACK_FROM) {
    row.items = [...list]
  }

  return row
}

function linkRow(id: string, label: string, url: string | null): FactRow {
  const row: FactRow = { id, label, value: url === null ? ABSENT : linkText(url) }

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
  const efforts = config.supported_reasoning_efforts

  const stated: (FactRow | null)[] = [
    statedRow('mandatory', 'Mandatory', flagOrNull(config.is_mandatory_reasoning)),
    statedRow('default-enabled', 'On by default', flagOrNull(config.default_reasoning_enabled)),
    efforts === null ? null : listRow('efforts', 'Efforts', efforts),
    statedRow('default-effort', 'Default effort', config.default_reasoning_effort),
    statedRow('budget', 'Token budget', flagOrNull(config.supports_reasoning_max_tokens)),
    statedRow('returned', 'Returned as', config.reasoning_return_mechanism),
  ]

  return [
    { id: 'reasoning', label: 'Reasoning', value: formatFlag(model.supports_reasoning) },
    ...stated.filter((row) => row !== null),
  ]
}

function statedRow(id: string, label: string, value: string | null): FactRow | null {
  return value === null ? null : { id, label, value }
}

const flagOrNull = (flag: boolean | null) => (flag === null ? null : formatFlag(flag))

/** The Model tab's sections: what holds for the model whichever provider serves it. */
export function modelSections(row: EndpointRow): Section[] {
  const { model } = row
  const { description, hf_slug: weights } = model

  return [
    {
      id: 'identity',
      rows: [
        { id: 'name', label: 'Name', value: model.name },
        { copyLabel: 'Copy model ID', id: 'id', label: 'ID', value: model.id },
        { id: 'author', label: 'Author', value: model.author.name ?? model.author.id },
      ],
      title: 'Identity',
    },
    {
      id: 'capabilities',
      rows: [
        listRow('input', 'Input', model.input_modalities),
        listRow('output', 'Output', model.output_modalities),
        ...reasoningRows(row),
        {
          description: 'Whether the weights are published on Hugging Face, which Links gives.',
          id: 'weights',
          label: 'Open weights',
          value: formatFlag(model.hf_slug !== null),
        },
      ],
      title: 'Capabilities',
    },
    {
      id: 'dates-limits',
      rows: [
        { id: 'released', label: 'Released', value: formatDate(model.created_at) },
        { id: 'cutoff', label: 'Knowledge cutoff', value: formatCutoff(model.knowledge_cutoff) },
        {
          description: 'Context length of this endpoint.',
          id: 'context',
          label: 'Context',
          value: formatContext(row.context),
        },
      ],
      title: 'Dates and limits',
    },
    // The description is prose: it sits after the facts and has no rows of its own.
    ...(description.trim() === ''
      ? []
      : [{ id: 'description', rows: [], text: description.trim(), title: 'Description' }]),
    {
      id: 'links',
      links: [modelPageUrl(model.id), ...(weights === null ? [] : [huggingFaceUrl(weights)])],
      rows: [],
      title: 'Links',
    },
  ]
}

/** The Provider tab's sections. */
export function providerSections({ provider }: EndpointRow): Section[] {
  return [
    {
      id: 'identity',
      rows: [
        { id: 'name', label: 'Name', value: provider.name },
        { copyLabel: 'Copy provider ID', id: 'id', label: 'ID', value: provider.id },
      ],
      title: 'Identity',
    },
    {
      id: 'locations',
      rows: [
        { id: 'headquarters', label: 'Headquarters', value: provider.headquarters ?? ABSENT },
        listRow('datacenters', 'Datacenters', provider.datacenters),
      ],
      title: 'Locations',
    },
    {
      id: 'service',
      rows: [
        { id: 'byok', label: 'BYOK', value: formatFlag(provider.byok_enabled) },
        {
          id: 'listed-endpoints',
          label: 'Listed endpoints',
          value: String(provider.listed_endpoints),
        },
        { id: 'listed-models', label: 'Listed models', value: String(provider.listed_models) },
      ],
      title: 'Service',
    },
    {
      // The provider's own pages keep their labels: their hosts repeat, so a hostname alone would not tell them apart.
      id: 'links',
      links: [providerPageUrl(provider.id)],
      rows: [
        linkRow('status', 'Status page', provider.status_page_url),
        linkRow('privacy', 'Privacy policy', provider.privacy_policy_url),
        linkRow('terms', 'Terms of service', provider.terms_of_service_url),
      ],
      title: 'Links',
    },
  ]
}
