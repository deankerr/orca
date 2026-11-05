import type { AlertFact } from '@orca/backend/alerts/curate'
import { formatDistance } from 'date-fns'

import { fieldLabel as compactLabel, formatQuantity, isQuantity, priceUnit } from '@/lib/backend'

export function formatChangeValue(
  item: AlertFact,
  { now = new Date() }: { now?: Date } = {},
): string {
  if (item.value === null) {
    return 'null'
  }

  if (item.kind === 'date') {
    return formatDate(item.value, now)
  }

  if (isQuantity(item)) {
    return formatQuantity(item)
  }

  if (item.kind === 'flag') {
    return String(item.value)
  }

  return item.kind === 'list' ? JSON.stringify(item.value) : item.value
}

/** Dates read in the viewer's time zone, like the feed's scan headers: `Dec 1, 2026, 1:00 PM (in 26 days)`. */
function formatDate(iso: string, now: Date): string {
  const date = new Date(iso)

  const local = date.toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    hour12: true,
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return `${local} (${formatDistance(date, now, { addSuffix: true })})`
}

/** Units apply only to quoted prices. */
export function formatChangeUnit(...items: AlertFact[]): string {
  const [first] = items
  const unit = first === undefined ? undefined : priceUnit(first.field)

  return unit !== undefined && items.every((item) => item.kind === 'price' && item.value !== null)
    ? unit
    : ''
}

/** The Monitor names the override field by what it carries. */
export const fieldLabel = (field: string): string =>
  field === 'pricing.overrides' ? 'Conditional pricing' : compactLabel(field)
