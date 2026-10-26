import type { AlertChange, AlertFact } from '../../shared/alerts/curate'
import {
  fieldLabel,
  formatQuantity,
  isBlockText,
  isQuantity,
  presentChange,
} from '../../shared/alerts/present'
import type { Movement } from '../../shared/alerts/present'
import { changeRow, dot, escape, presence, strike, valueChange } from './display'

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
    return changeRow(label, 'changed')
  }

  if (presented.transition === 'members') {
    const members = (items: string[], transition: 'added' | 'removed') =>
      items.length === 0 ? [] : [presence(items.map(escape).join(', '), transition)]

    return changeRow(
      label,
      [...members(presented.added, 'added'), ...members(presented.removed, 'removed')].join(dot),
    )
  }

  if (change.kind === 'prose') {
    return proseChange(label, change.before, change.after)
  }

  if (presented.transition === 'added' || presented.transition === 'removed') {
    const value = changeValue(presented.fact, suffix)

    return isBlockText(presented.fact, 'single')
      ? changeRow(label, blockPresence(`> ${value}`, presented.transition), { layout: 'block' })
      : changeRow(label, presence(value, presented.transition))
  }

  const [before, after] = [
    changeValue(presented.before, suffix),
    changeValue(presented.after, suffix),
  ]

  // Like the Monitor, long text strikes the old value above the new one.
  if (isBlockText(presented.before, 'pair') || isBlockText(presented.after, 'pair')) {
    return changeRow(label, `> ~~${before}~~\n> ${after}`, { layout: 'block' })
  }

  return changeRow(
    label,
    valueChange(before, after, {
      annotation: annotation ?? (presented.movement === null ? '' : delta(presented.movement)),
    }),
  )
}

/** A block's presence is named after its label: `- **description** (removed)`, then the quote. */
function blockPresence(quoted: string, transition: 'added' | 'removed'): string {
  return transition === 'added' ? `(new)\n${quoted}` : `(removed)\n${strike(quoted)}`
}

function proseChange(label: string, before: string | null, after: string | null): string {
  const start = before !== null && after !== null ? changedExcerptStart(before, after) : 0

  if (before === null || after === null) {
    const [text, transition] =
      before === null ? [after, 'added' as const] : [before, 'removed' as const]

    return changeRow(label, text === null ? 'null' : blockPresence(quote(text, start), transition))
  }

  return changeRow(label, `Before\n${quote(before, start)}\n\nAfter\n${quote(after, start)}`, {
    layout: 'block',
  })
}

/** Each value shows at most this many characters, so one value cannot crowd out the rest of a card. */
const excerptLength = 800

/** Prefix excerpts are sufficient until the change falls beyond the visible excerpt. */
function changedExcerptStart(before: string, after: string): number {
  let firstDifference = 0

  while (
    firstDifference < before.length &&
    firstDifference < after.length &&
    before[firstDifference] === after[firstDifference]
  ) {
    firstDifference += 1
  }

  return firstDifference < excerptLength ? 0 : firstDifference - 160
}

/** Change values are plain text: escaped, with links left clickable. */
function changeValue(item: AlertFact, suffix = ''): string {
  if (item.value === null) {
    return 'null'
  }

  if (isQuantity(item)) {
    return `${formatQuantity(item)}${item.kind === 'count' ? suffix : ''}`
  }

  if (item.kind === 'flag') {
    return String(item.value)
  }

  if (item.kind === 'list') {
    return item.value.length === 0 ? '[]' : item.value.map(escape).join(', ')
  }

  return link(item.value) ?? escape(excerpt(item.value))
}

/**
 * Angle brackets bound an http(s) URL so adjacent Markdown, such as `~~`, stays outside the link.
 * URLs longer than an excerpt are excerpted as text instead, since a clipped link would be broken.
 */
function link(text: string): string | null {
  return text.length <= excerptLength && /^https?:\/\/[^\s<>]+$/iu.test(text) ? `<${text}>` : null
}

/** Upstream Markdown uses OpenRouter-relative links; restore their origin for Discord. */
export function quote(text: string, start = 0): string {
  const markdown = excerpt(text, start).replaceAll(/\]\(\/(?!\/)/gu, '](https://openrouter.ai/')

  return `> ${markdown.replaceAll('\n', '\n> ')}`
}

function excerpt(text: string, start = 0, limit = excerptLength): string {
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

  return percent === '' ? symbol : `${symbol}${percent}`
}
