import { formatNumber, formatPercent, formatPrice, relativeChange } from '../../../numbers'
import type { AlertChange, AlertFact } from '../../shared/alerts/curate'
import { measured, sides } from '../../shared/alerts/facts'
import { priceMeters } from '../../shared/alerts/pricing'
import { code, dot, field, valueChange } from './display'

/** Raw field presentation; callers own any field-specific labels and units. */
export const fieldName = (name: string): string => name.split('.').at(-1) ?? name

export function fieldChange(
  change: AlertChange,
  {
    label = fieldName(change.field),
    suffix,
    annotation,
  }: { label?: string; suffix?: string | undefined; annotation?: string } = {},
): string {
  if (change.kind === 'opaque') {
    return field(label, 'changed')
  }

  if (change.kind === 'list') {
    const lines = [
      ...change.added.map((item) => `+ ${code(item)}`),
      ...change.removed.map((item) => `− ~~${code(item)}~~`),
    ]

    return field(label, lines.join('\n'), { layout: 'block' })
  }

  if (change.kind === 'prose') {
    const start =
      change.before !== null && change.after !== null
        ? changedExcerptStart(change.before, change.after)
        : 0

    const prose = (text: string | null) => (text === null ? code('null') : quote(text, start))

    if (change.before === null) {
      return field(label, prose(change.after), { change: 'added', layout: 'block' })
    }

    if (change.after === null) {
      return field(label, prose(change.before), { change: 'removed', layout: 'block' })
    }

    return field(label, `Before\n${prose(change.before)}\n\nAfter\n${prose(change.after)}`, {
      layout: 'block',
    })
  }

  const { before, after } = sides(change)

  if (before.value === null) {
    return field(label, fieldValue(after, { suffix }), { change: 'added' })
  }

  if (after.value === null) {
    return field(label, fieldValue(before, { suffix }), { change: 'removed' })
  }

  const quantities = measured(change)

  return field(
    label,
    valueChange(fieldValue(before, { suffix }), fieldValue(after, { suffix }), {
      annotation:
        annotation ?? (quantities === null ? '' : delta(quantities.before, quantities.after)),
    }),
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

/** Facts in the caller's order; unknown and empty facts are omitted. */
export function factsText(
  facts: readonly AlertFact[],
  fields: string[],
  {
    label = fieldName,
    suffix,
  }: { label?: (field: string) => string; suffix?: (field: string) => string } = {},
): string {
  return fields
    .flatMap((name) => {
      const item = facts.find((candidate) => candidate.field === name)

      return item === undefined ||
        item.value === null ||
        (item.kind === 'list' && item.value.length === 0)
        ? []
        : [field(label(name), fieldValue(item, { suffix: suffix?.(name) }))]
    })
    .join(dot)
}

export function fieldValue(
  item: AlertFact,
  { suffix = '' }: { suffix?: string | undefined } = {},
): string {
  if (item.value === null) {
    return code('null')
  }

  if (item.kind === 'flag') {
    return code(String(item.value))
  }

  if (item.kind === 'count') {
    return code(`${formatNumber(item.value) ?? String(item.value)}${suffix}`)
  }

  if (item.kind === 'percent') {
    return code(formatPercent(item.value) ?? String(item.value))
  }

  if (item.kind === 'price') {
    const meter = priceMeters[item.field]

    return code(
      (meter === undefined ? null : formatPrice(item.value, meter.scale)) ?? `$${item.value}`,
    )
  }

  if (item.kind === 'list') {
    return code(item.value.length === 0 ? '[]' : item.value.join(', '))
  }

  return code(excerpt(item.value))
}

/** Upstream Markdown uses OpenRouter-relative links; restore their origin for Discord. */
export function quote(text: string, start = 0): string {
  const markdown = excerpt(text, start).replaceAll(/\]\(\/(?!\/)/gu, '](https://openrouter.ai/')

  return `> ${markdown.replaceAll('\n', '\n> ')}`
}

function excerpt(text: string, start = 0, limit = 800): string {
  const end = start + limit
  const clipped = start > 0 || text.length > end

  return `${start > 0 ? '… ' : ''}${text.slice(start, end)}${text.length > end ? '…' : ''}${clipped ? ' [excerpt]' : ''}`
}

const deltaSymbols = {
  down: { favorable: '▼', unfavorable: '🔻' },
  up: { favorable: '▲', unfavorable: '🔺' },
}

/** Numeric interpretation is shared; Discord owns symbols and favorable direction. */
export function delta(
  before: number | string,
  after: number | string,
  { lowerIsBetter = false }: { lowerIsBetter?: boolean } = {},
): string {
  // Round the original ratio once: 8.49% → 8%, 18.6% → 19%. Keep only the
  // pointer below 0.5%, rather than claiming a real change was 0%.
  const change = relativeChange(before, after, { fractionDigits: 0 })

  if (change === null) {
    return ''
  }

  const direction = deltaSymbols[change.isUp ? 'up' : 'down']
  const symbol = change.isUp === lowerIsBetter ? direction.unfavorable : direction.favorable

  return change.percent === '' ? symbol : `${symbol} ${change.percent}`
}
