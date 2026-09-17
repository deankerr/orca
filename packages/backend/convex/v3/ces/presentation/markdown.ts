import { diff } from 'json-diff-ts'
import { z } from 'zod'

import { EntityChange } from '../entityChange'

type Json = z.infer<ReturnType<typeof z.json>>
type RecordValue = Record<string, Json>

/** Treat observed strings as text, including Markdown punctuation and multiline upstream copy. */
function escape(value: string): string {
  return value.replaceAll(/\s+/g, ' ').replaceAll(/[\\`*_{}[\]<>()#|]/g, '\\$&')
}

const labels: Record<string, string> = {
  'pricing.prompt': 'Input price',
  'pricing.completion': 'Output price',
  'pricing.input_cache_read': 'Cache-read price',
  'pricing.input_cache_write': 'Cache-write price',
  'pricing.discount': 'Discount',
  'pricing.overrides': 'Conditional pricing',
  'pricing.display_pricing': 'Pricing display',
  display_name: 'Name',
}

function label(path: string): string {
  for (const [key, title] of Object.entries(labels)) {
    if (path === key) {
      return title
    }
    if (path.startsWith(`${key}.`)) {
      return `${title} / ${label(path.slice(key.length + 1))}`
    }
  }
  const words = path
    .replace(/^metadata\./, '')
    .replaceAll('_', ' ')
    .replaceAll('.', ' / ')
    .replaceAll(/\b(?:rpm|tpm|id)\b/g, (word) => word.toUpperCase())
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

/** Shift fixed-point token prices by six decimal places without floating-point rounding.
 * Unfamiliar decimal representations keep their exact per-token form rather than being guessed at.
 */
function tokenPrice(price: string): string {
  const decimal = /^(?<whole>\d+)(?:\.(?<fraction>\d+))?$/.exec(price)?.groups
  if (decimal === undefined || price.length > 100) {
    return `$${escape(price)} per token`
  }
  const fraction = (decimal.fraction ?? '').padEnd(6, '0')
  const whole = BigInt(`${decimal.whole}${fraction.slice(0, 6)}`).toLocaleString('en-US')
  const remainder = fraction.slice(6).replace(/0+$/, '')
  return `$${whole}${remainder === '' ? '' : `.${remainder}`} per million tokens`
}

function value(value: Json | undefined, path: string): string {
  if (value === undefined) {
    return 'absent'
  }
  if (value === null) {
    return 'null'
  }
  if (value === true) {
    return 'yes'
  }
  if (value === false) {
    return 'no'
  }
  if (typeof value === 'number') {
    return path === 'pricing.discount'
      ? new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 12 }).format(
          value,
        )
      : new Intl.NumberFormat('en-US', { maximumSignificantDigits: 21 }).format(value)
  }
  if (
    typeof value === 'string' &&
    [
      'pricing.prompt',
      'pricing.completion',
      'pricing.input_cache_read',
      'pricing.input_cache_write',
    ].includes(path)
  ) {
    return tokenPrice(value)
  }
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  // Presentation deliberately summarizes large upstream arrays/strings; the complete evidence stays
  // in the event. Unknown fields still receive a readable generic sentence.
  return `“${escape(text.length > 300 ? `${text.slice(0, 300)}…` : text)}”`
}

/** Keep the first differing portion visible instead of showing two identical truncated prefixes. */
function excerpts(before: string, after: string): [string, string] {
  let common = 0
  while (common < before.length && common < after.length && before[common] === after[common]) {
    common += 1
  }
  const start = Math.max(0, common - 40)
  const excerpt = (text: string) =>
    `${start > 0 ? '…' : ''}${text.slice(start, start + 220)}${text.length > start + 220 ? '…' : ''}`
  return [excerpt(before), excerpt(after)]
}

function object(value: Json | undefined): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Describe nested evidence without assigning identities to upstream array rows. Entry numbers refer
 * only to positions in the observed arrays, including when upstream has reordered those arrays.
 */
function describe(before: RecordValue, after: RecordValue, prefix = ''): string[] {
  const lines: string[] = []
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const previous = before[key]
    const next = after[key]
    if (diff({ value: previous }, { value: next }).length === 0) {
      continue
    }
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (object(previous) && object(next)) {
      lines.push(...describe(previous, next, path))
    } else if (
      Array.isArray(previous) &&
      Array.isArray(next) &&
      [...previous, ...next].some((item) => typeof item === 'object' && item !== null)
    ) {
      lines.push(
        ...describe(
          Object.fromEntries(previous.map((entry, index) => [`entry ${index + 1}`, entry])),
          Object.fromEntries(next.map((entry, index) => [`entry ${index + 1}`, entry])),
          path,
        ),
      )
    } else if (previous === undefined) {
      lines.push(`${escape(label(path))} was added: ${value(next, path)}.`)
    } else if (next === undefined) {
      lines.push(`${escape(label(path))} was removed; previously ${value(previous, path)}.`)
    } else if (
      typeof previous === 'string' &&
      typeof next === 'string' &&
      Math.max(previous.length, next.length) > 300
    ) {
      const [oldExcerpt, newExcerpt] = excerpts(previous, next)
      lines.push(
        `${escape(label(path))} changed (excerpts): ${value(oldExcerpt, '')} → ${value(newExcerpt, '')}.`,
      )
    } else {
      lines.push(
        `${escape(label(path))} changed from ${value(previous, path)} to ${value(next, path)}.`,
      )
    }
  }
  return lines
}

function name(record: RecordValue, key: string, fallback: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : fallback
}

/** Phase 3: pure, just-in-time natural-language Markdown. No table lookups or policy decisions. */
export function renderEntry(event: { _id: string; content: EntityChange }): string {
  const {
    changes: { before, after },
    context,
    from_scan_at,
    scan_at,
    collection,
    entity_id,
    category,
  } = event.content
  const record = context.after.entity ?? context.before.entity
  if (record === null) {
    throw new Error('CES event has no entity context')
  }
  const kind =
    collection === 'models' ? 'Model' : collection === 'providers' ? 'Provider' : 'Endpoint'
  const title =
    collection === 'endpoints'
      ? `${name(record, 'model_display_name', entity_id)} via ${name(record, 'provider_display_name', 'unknown provider')}`
      : name(record, 'display_name', entity_id)
  const outcome =
    before === null
      ? 'appeared in the observed catalog'
      : after === null
        ? 'disappeared from the observed catalog'
        : category === 'pricing'
          ? 'pricing changed'
          : 'changed'
  const lines = before !== null && after !== null ? describe(before, after) : []
  const details = lines.slice(0, 30).map((line) => `- ${line}`)
  if (lines.length > 30) {
    details.push(`- ${lines.length - 30} additional field changes are retained in the event.`)
  }
  // Lifecycle entries need useful context without reciting the entire record as newly added fields.
  if (before === null || after === null) {
    const { pricing } = record
    if (object(pricing)) {
      for (const key of ['prompt', 'completion']) {
        if (pricing[key] !== undefined) {
          details.push(`- ${label(`pricing.${key}`)}: ${value(pricing[key], `pricing.${key}`)}.`)
        }
      }
    }
    const description = object(record.metadata) ? record.metadata.description : undefined
    if (typeof description === 'string') {
      details.push(`- Description: ${value(description, 'description')}.`)
    }
  }
  // The source interval stays visible even when processing produces the event much later.
  const start = from_scan_at.slice(0, 19).replace('T', ' ')
  const end =
    from_scan_at.slice(0, 10) === scan_at.slice(0, 10)
      ? scan_at.slice(11, 19)
      : scan_at.slice(0, 19).replace('T', ' ')
  return [
    `## ${escape(title)}`,
    `${kind} ${outcome}.`,
    `Observed ${start} – ${end} UTC · [Full event](/ces/events/${encodeURIComponent(event._id)})`,
    details.join('\n'),
  ]
    .filter((line) => line !== '')
    .join('\n\n')
}

/** The table accepts independent event formats. Unsupported formats expose their content directly;
 * invalid JSON or a broken known format is an error, not a reason to catch and hide a failure.
 */
export function renderEvent(event: { _id: string; content: string }): string {
  const content = z.json().parse(JSON.parse(event.content))
  if (object(content) && content.type === 'entity-change') {
    return renderEntry({ _id: event._id, content: EntityChange.parse(content) })
  }
  // Indentation keeps arbitrary upstream Markdown fences inert without special escaping rules.
  const json = JSON.stringify(content, null, 2)
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
  return `## Event\n\n[Full event](/ces/events/${encodeURIComponent(event._id)})\n\n${json}`
}
