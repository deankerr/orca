import { computeDelta } from '../../../shared/formatters'
import type { FieldChange, FieldValue } from '../curate'
import { code, field, valueChange } from './display'

/** Raw path presentation; callers own any field-specific labels and value formatting. */
export const fieldName = (path: string): string => path.split('.').at(-1) ?? path

type ValueFormatter = (value: FieldValue, path: string) => string

export function fieldChange(
  change: FieldChange,
  {
    label = fieldName(change.path),
    prose = false,
    formatValue = (value) => fieldValue(value),
    annotation,
  }: {
    label?: string
    prose?: boolean
    formatValue?: ValueFormatter
    annotation?: string
  } = {},
): string {
  const name = label

  if (change.type === 'set_updated') {
    const literal = (text: string) =>
      text.replaceAll('`', '\\u0060').replaceAll('\n', '\\n').replaceAll('\r', '\\r')

    const lines = [
      ...change.added.map((item) => `+ ${literal(item)}`),
      ...change.removed.map((item) => `- ${literal(item)}`),
    ]

    return field(name, `\`\`\`diff\n${lines.join('\n')}\n\`\`\``, { layout: 'block' })
  }

  const format = (input: FieldValue) => formatValue(input, change.path)

  if (prose || hasLongText(change)) {
    const start =
      change.type === 'field_updated' &&
      typeof change.before === 'string' &&
      typeof change.after === 'string'
        ? changedExcerptStart(change.before, change.after)
        : 0

    const proseValue = (input: FieldValue) =>
      typeof input === 'string' ? quote(input, start) : format(input)

    if (change.type === 'field_added') {
      return field(name, proseValue(change.after), { layout: 'block', change: 'added' })
    }

    if (change.type === 'field_removed') {
      return field(name, proseValue(change.before), { layout: 'block', change: 'removed' })
    }

    return field(
      name,
      `Before\n${proseValue(change.before)}\n\nAfter\n${proseValue(change.after)}`,
      {
        layout: 'block',
      },
    )
  }

  if (change.type === 'field_added') {
    return field(name, format(change.after), { change: 'added' })
  }

  if (change.type === 'field_removed') {
    return field(name, format(change.before), { change: 'removed' })
  }

  return field(
    name,
    valueChange(format(change.before), format(change.after), {
      annotation: annotation ?? delta(change.before, change.after),
    }),
  )
}

function hasLongText(change: FieldChange): boolean {
  return ['before' in change ? change.before : null, 'after' in change ? change.after : null].some(
    (value) => typeof value === 'string' && value.length > 100,
  )
}

/** Prefix excerpts are sufficient until the change falls beyond the visible 800 characters. */
function changedExcerptStart(before: string, after: string): number {
  let firstDifference = 0

  while (
    firstDifference < before.length &&
    firstDifference < after.length &&
    before[firstDifference] === after[firstDifference]
  ) {
    firstDifference += 1
  }

  return firstDifference < 800 ? 0 : firstDifference - 160
}

export function factsText(
  facts: Record<string, FieldValue>,
  paths: string[],
  formatValue: ValueFormatter = (value) => fieldValue(value),
): string {
  return paths
    .flatMap((path) => {
      const input = fact(facts, path)

      return input === undefined || input === null || (Array.isArray(input) && input.length === 0)
        ? []
        : [field(fieldName(path), formatValue(input, path))]
    })
    .join(' · ')
}

export function fieldValue(value: FieldValue, { suffix = '' }: { suffix?: string } = {}): string {
  const input = normalizeValue(value)
  if (input === null || typeof input === 'boolean') {
    return code(String(input))
  }

  if (typeof input === 'number') {
    const formatted = input.toLocaleString('en-US', { maximumSignificantDigits: 21 })

    return code(`${formatted}${suffix}`)
  }

  if (Array.isArray(input)) {
    return code(input.length === 0 ? '[]' : input.join(', '))
  }

  if (typeof input === 'string') {
    return code(excerpt(input))
  }

  return code(excerpt(JSON.stringify(input)))
}

/** Upstream Markdown uses OpenRouter-relative links; restore their origin for Discord. */
export function quote(text: string, start = 0): string {
  if (normalizeValue(text) === null) {
    return fieldValue(null)
  }

  const markdown = excerpt(text, start).replaceAll(/\]\(\/(?!\/)/g, '](https://openrouter.ai/')

  return `> ${markdown.replaceAll('\n', '\n> ')}`
}

/** Empty upstream text is presented as null only in Discord; captured facts stay intact. */
function normalizeValue(value: FieldValue): FieldValue {
  return typeof value === 'string' && value.trim() === '' ? null : value
}

function excerpt(text: string, start = 0, limit = 800): string {
  const end = start + limit
  const clipped = start > 0 || text.length > end

  return `${start > 0 ? '… ' : ''}${text.slice(start, end)}${text.length > end ? '…' : ''}${clipped ? ' [excerpt]' : ''}`
}

export function fact(facts: Record<string, FieldValue>, path: string): FieldValue | undefined {
  const [key = '', child] = path.split('.')
  const parent = facts[key]

  return child === undefined
    ? parent
    : parent !== null && typeof parent === 'object' && !Array.isArray(parent)
      ? parent[child]
      : undefined
}

/** Numeric deltas are generic; callers convert money strings when the field requires it. */
export function delta(before: FieldValue, after: FieldValue): string {
  const change = computeDelta(before, after)

  return change === null || !Number.isFinite(change.pct) || change.pct === 0
    ? ''
    : `${change.isUp ? '▲' : '▼'} ${Math.abs(change.pct).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`
}
