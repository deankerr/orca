import { UTCDateMini } from '@date-fns/utc'
import { formatNumber } from '@orca/backend/numbers'
import type { Value } from '@orca/properties'
import { format, isValid } from 'date-fns'

import { ABSENT } from '#lib/format'

/** `yes`, `no`, or a dash when the Contract does not know. */
export function formatFlag(flag: boolean | null): string {
  if (flag === null) {
    return ABSENT
  }

  return flag ? 'yes' : 'no'
}

/** A UTC calendar date: `2026-10-24`. */
export function formatDate(iso: string | null): string {
  if (iso === null) {
    return ABSENT
  }

  const date = new UTCDateMini(iso)

  return isValid(date) ? format(date, 'yyyy-MM-dd') : ABSENT
}

/** A whole number with grouping: `128,000`. */
export function formatTokens(count: number | null): string {
  return count === null ? ABSENT : (formatNumber(count) ?? ABSENT)
}

export function formatDays(days: number): string {
  return `${formatNumber(days) ?? days} ${days === 1 ? 'day' : 'days'}`
}

/** A list in the order the Contract gives it. */
export function formatList(items: readonly string[] | null): string {
  return items === null || items.length === 0 ? ABSENT : items.join(', ')
}

/**
 * A property name in the panel's sentence case: `Prompt Retention` becomes `Prompt retention`, while
 * acronyms and camel-cased names (`ZDR`, `User ID`, `OpenRouter`) keep their capitals.
 */
export function sentenceCase(name: string): string {
  return name
    .split(' ')
    .map((word, index) => {
      const keepsCase = index === 0 || /[A-Z].*[A-Z]/u.test(word)

      return keepsCase ? word : word.toLowerCase()
    })
    .join(' ')
}

const isList = (value: Value): value is readonly string[] => Array.isArray(value)

/** A property's own value as the panel shows it: `true` reads `yes`, numbers group their digits. */
export function formatValue(value: Value | true): string {
  if (value === true) {
    return 'yes'
  }

  return isList(value) ? formatList(value) : (formatNumber(value) ?? String(value))
}
