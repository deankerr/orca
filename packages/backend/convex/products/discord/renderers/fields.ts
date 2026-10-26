import type { AlertChange, AlertFact } from '../../shared/alerts/curate'
import { fieldLabel, formatQuantity, isQuantity, presentChange } from '../../shared/alerts/present'
import type { Movement } from '../../shared/alerts/present'
import { code, dot, fieldRow, valueChange } from './display'

export function fieldChange(
  change: AlertChange,
  {
    label = fieldLabel(change.field),
    suffix,
    annotation,
  }: { label?: string; suffix?: string | undefined; annotation?: string } = {},
): string {
  // Discord rounds movement to whole percentages.
  const presented = presentChange(change, { fractionDigits: 0 })

  if (presented.transition === 'opaque') {
    return fieldRow(label, 'changed')
  }

  if (presented.transition === 'members') {
    const lines = [
      ...presented.added.map((item) => `+ ${code(item)}`),
      ...presented.removed.map((item) => `− ~~${code(item)}~~`),
    ]

    return fieldRow(label, lines.join('\n'), { layout: 'block' })
  }

  if (change.kind === 'prose') {
    return proseChange(label, change.before, change.after)
  }

  if (presented.transition === 'added' || presented.transition === 'removed') {
    return fieldRow(label, fieldValue(presented.fact, { suffix }), { change: presented.transition })
  }

  return fieldRow(
    label,
    valueChange(fieldValue(presented.before, { suffix }), fieldValue(presented.after, { suffix }), {
      annotation: annotation ?? (presented.movement === null ? '' : delta(presented.movement)),
    }),
  )
}

function proseChange(label: string, before: string | null, after: string | null): string {
  const start = before !== null && after !== null ? changedExcerptStart(before, after) : 0
  const prose = (text: string | null) => (text === null ? code('null') : quote(text, start))

  if (before === null) {
    return fieldRow(label, prose(after), { change: 'added', layout: 'block' })
  }

  if (after === null) {
    return fieldRow(label, prose(before), { change: 'removed', layout: 'block' })
  }

  return fieldRow(label, `Before\n${prose(before)}\n\nAfter\n${prose(after)}`, { layout: 'block' })
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
    label = fieldLabel,
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
        : [fieldRow(label(name), fieldValue(item, { suffix: suffix?.(name) }))]
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

  if (isQuantity(item)) {
    return code(`${formatQuantity(item)}${item.kind === 'count' ? suffix : ''}`)
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

/** Movement is shared; Discord owns its symbols. */
export function delta({ isUp, isFavorable, percent }: Movement): string {
  const direction = deltaSymbols[isUp ? 'up' : 'down']
  const symbol = isFavorable ? direction.favorable : direction.unfavorable

  return percent === '' ? symbol : `${symbol} ${percent}`
}
