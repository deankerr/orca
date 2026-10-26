import type { AlertFact } from '@orca/backend/alerts/curate'

import { fieldLabel as compactLabel, formatQuantity, isQuantity, priceUnit } from '@/lib/backend'

export function formatChangeValue(item: AlertFact): string {
  if (item.value === null) {
    return 'null'
  }

  if (isQuantity(item)) {
    return formatQuantity(item)
  }

  if (item.kind === 'flag') {
    return String(item.value)
  }

  return item.kind === 'list' ? JSON.stringify(item.value) : item.value
}

/** Units apply only to quoted prices. */
export function formatChangeUnit(...items: AlertFact[]): string {
  const [first] = items
  const unit = first === undefined ? undefined : priceUnit(first.field)

  return unit !== undefined && items.every((item) => item.kind === 'price' && item.value !== null)
    ? unit
    : ''
}

/** The Monitor names the opaque override field by what it carries. */
export const fieldLabel = (field: string): string =>
  field === 'pricing.overrides' ? 'Price schedule' : compactLabel(field)
