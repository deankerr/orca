import type { AlertChange, AlertFact } from '@orca/backend/alerts/curate'
import { measured } from '@orca/backend/alerts/facts'
import { priceMeters } from '@orca/backend/alerts/pricing'
import { formatNumber, formatPercent, formatPrice, relativeChange } from '@orca/backend/numbers'

export function formatChangeValue(item: AlertFact): string {
  if (item.value === null) {
    return 'null'
  }

  if (item.kind === 'percent') {
    return formatPercent(item.value) ?? String(item.value)
  }

  if (item.kind === 'price') {
    const meter = priceMeters[item.field]

    return (meter === undefined ? null : formatPrice(item.value, meter.scale)) ?? item.value
  }

  if (item.kind === 'count') {
    return formatNumber(item.value) ?? String(item.value)
  }

  if (item.kind === 'flag') {
    return String(item.value)
  }

  return item.kind === 'list' ? JSON.stringify(item.value) : item.value
}

/** Units apply only to quoted prices. */
export function formatChangeUnit(...items: AlertFact[]): string {
  const [first] = items
  const meter = first === undefined ? undefined : priceMeters[first.field]

  return meter !== undefined && items.every((item) => item.kind === 'price' && item.value !== null)
    ? meter.unit
    : ''
}

interface FieldLabels {
  [field: string]: string
}

const fieldLabels: FieldLabels = {
  max_completion_tokens: 'max_output',
  'pricing.overrides': 'Price schedule',
}

export const fieldLabel = (field: string): string =>
  priceMeters[field]?.label ?? fieldLabels[field] ?? field.split('.').at(-1) ?? field

/** Lower prices and higher limits are favorable. */
export function formatChangeDelta(change: AlertChange) {
  const quantities = measured(change)
  const delta = quantities === null ? null : relativeChange(quantities.before, quantities.after)

  return delta === null
    ? null
    : { ...delta, isGood: change.kind === 'price' ? !delta.isUp : delta.isUp }
}
