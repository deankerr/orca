import { diff } from 'json-diff-ts'
import type { z } from 'zod'

type Json = z.infer<ReturnType<typeof z.json>>
export type RecordValue = Record<string, Json>

const labels: Record<string, string> = {
  'pricing.prompt': 'Input price',
  'pricing.completion': 'Output price',
  'pricing.input_cache_read': 'Cache-read price',
  'pricing.input_cache_write': 'Cache-write price',
  'pricing.discount': 'Discount',
  display_name: 'Name',
}

export function label(path: string): string {
  return labels[path] ?? path
}

/** Code spans preserve literal punctuation; a longer delimiter accommodates embedded backticks. */
export function inlineCode(text: string): string {
  const fence = '`'.repeat(Math.max(0, ...[...text.matchAll(/`+/g)].map(([run]) => run.length)) + 1)
  return `${fence} ${text} ${fence}`
}

/** Shift fixed-point token prices by six decimal places without floating-point rounding.
 * Unfamiliar decimal representations keep their exact per-token form rather than being guessed at.
 */
function tokenPrice(price: string): string {
  const decimal = /^(?<whole>\d+)(?:\.(?<fraction>\d+))?$/.exec(price)?.groups

  if (decimal === undefined || price.length > 100) {
    return `${inlineCode(`$${price}`)} per token`
  }

  const fraction = (decimal.fraction ?? '').padEnd(6, '0')
  const whole = BigInt(`${decimal.whole}${fraction.slice(0, 6)}`).toLocaleString('en-US')
  const remainder = fraction.slice(6).replace(/0+$/, '')
  return `$${whole}${remainder === '' ? '' : `.${remainder}`} per million tokens`
}

export function value(value: Json | undefined, path: string): string {
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
  return inlineCode(JSON.stringify(text.length > 300 ? `${text.slice(0, 300)}…` : text))
}

export function object(value: Json | undefined): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Literal before/after values avoid inventing meaning for unfamiliar upstream fields. */
function rawChanges(before: RecordValue, after: RecordValue): string {
  const lines: string[] = []
  let count = 0
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (diff({ value: before[key] }, { value: after[key] }).length === 0) {
      continue
    }
    count += 1
    if (count > 30) {
      continue
    }
    // JSON-quote unusual keys so embedded newlines cannot break the fenced block.
    const name = /^[\w.-]+$/.test(key) ? key : JSON.stringify(key)
    if (Object.hasOwn(before, key)) {
      lines.push(`- ${name}: ${JSON.stringify(before[key])}`)
    }
    if (Object.hasOwn(after, key)) {
      lines.push(`+ ${name}: ${JSON.stringify(after[key])}`)
    }
  }
  return [
    '```diff',
    ...lines,
    '```',
    ...(count > 30 ? [`${count - 30} additional field changes are retained in the event.`] : []),
  ].join('\n')
}

/** Natural language is opt-in; metadata and other unfamiliar properties use literal diffs. */
export function describeChanges(before: RecordValue, after: RecordValue, prefix = ''): string[] {
  const lines: string[] = []
  const rawBefore: RecordValue = {}
  const rawAfter: RecordValue = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const previous = before[key]
    const next = after[key]

    if (diff({ value: previous }, { value: next }).length === 0) {
      continue
    }

    const path = prefix === '' ? key : `${prefix}.${key}`

    if (path === 'metadata' && object(previous) && object(next)) {
      lines.push(`Metadata\n\n${rawChanges(previous, next)}`)
    } else if (path === 'pricing' && object(previous) && object(next)) {
      lines.push(...describeChanges(previous, next, path))
    } else if (!Object.hasOwn(labels, path)) {
      if (previous !== undefined) {
        rawBefore[path] = previous
      }
      if (next !== undefined) {
        rawAfter[path] = next
      }
    } else if (previous === undefined) {
      lines.push(`- ${label(path)} was added: ${value(next, path)}.`)
    } else if (next === undefined) {
      lines.push(`- ${label(path)} was removed; previously ${value(previous, path)}.`)
    } else {
      lines.push(`- ${label(path)} changed from ${value(previous, path)} to ${value(next, path)}.`)
    }
  }
  if (Object.keys(rawBefore).length > 0 || Object.keys(rawAfter).length > 0) {
    lines.push(rawChanges(rawBefore, rawAfter))
  }
  return lines
}
