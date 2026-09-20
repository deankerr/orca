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
  provider_display_name: 'Provider name',
  model_display_name: 'Model name',
  'metadata.context_length': 'Context length',
  'metadata.max_completion_tokens': 'Maximum completion tokens',
  'metadata.max_prompt_tokens': 'Maximum prompt tokens',
  'metadata.max_tokens_per_image': 'Maximum tokens per image',
  'metadata.max_prompt_images': 'Maximum images per prompt',
  'metadata.limit_rpm': 'Requests per minute',
  'metadata.limit_rpd': 'Requests per day',
  'metadata.quantization': 'Quantization',
  'metadata.supported_parameters': 'Supported parameters',
  'metadata.supports_reasoning': 'Reasoning support',
  'metadata.has_completions': 'Completions support',
  'metadata.has_chat_completions': 'Chat completions support',
  'metadata.features.supports_implicit_caching': 'Implicit caching support',
  'metadata.features.supports_native_web_search': 'Native web search support',
  'metadata.moderation_required': 'Moderation required',
  'metadata.is_disabled': 'Disabled',
  'metadata.data_policy.training': 'May train on data',
  'metadata.data_policy.canPublish': 'May publish data',
  'metadata.data_policy.requiresUserIDs': 'Shares user ID',
  'metadata.data_policy.retainsPrompts': 'May retain data',
  'metadata.data_policy.retentionDays': 'Data retention days',
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

function stringArray(value: Json | undefined): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** Describe membership changes without repeating the unchanged entries. */
function describeStringArray(before: string[], after: string[], path: string): string[] {
  const added = after.filter((item) => !before.includes(item))
  const removed = before.filter((item) => !after.includes(item))
  return [
    ...(added.length === 0 ? [] : [`- ${label(path)} added: ${added.map(inlineCode).join(', ')}.`]),
    ...(removed.length === 0
      ? []
      : [`- ${label(path)} removed: ${removed.map(inlineCode).join(', ')}.`]),
  ]
}

/** Known fields use prose; unfamiliar event fields retain a literal fallback. */
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

    if ((path === 'metadata' || path === 'pricing') && (object(previous) || object(next))) {
      lines.push(
        ...describeChanges(object(previous) ? previous : {}, object(next) ? next : {}, path),
      )
    } else if (!Object.hasOwn(labels, path)) {
      if (previous !== undefined) {
        rawBefore[path] = previous
      }
      if (next !== undefined) {
        rawAfter[path] = next
      }
    } else if (stringArray(previous) && stringArray(next)) {
      lines.push(...describeStringArray(previous, next, path))
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
