import type { FieldValue } from '@orca/backend/convex/v4/eventRenderers/curate'
import {
  formatNumber,
  formatPercent,
  formatPrice,
  relativeChange,
} from '@orca/backend/convex/v4/eventRenderers/numbers'
import { priceMeters } from '@orca/backend/convex/v4/eventRenderers/pricing'

export function formatChangeValue(value: FieldValue, path: string): string {
  if (path === 'pricing.discount' && typeof value === 'number') {
    return formatPercent(value) ?? String(value)
  }

  const meter = priceMeters[path]

  if (meter !== undefined && typeof value === 'string') {
    return formatPrice(value, meter.scale) ?? value
  }

  if (typeof value === 'number') {
    return formatNumber(value) ?? String(value)
  }

  return typeof value === 'string' ? value : JSON.stringify(value)
}

export function formatChangeUnit(path: string, ...values: FieldValue[]): string {
  const meter = priceMeters[path]

  return meter !== undefined &&
    values.every((value) => typeof value === 'string' && formatPrice(value, meter.scale) !== null)
    ? meter.unit
    : ''
}
export const fieldLabel = (path: string): string =>
  priceMeters[path]?.label ??
  (path === 'max_completion_tokens' ? 'max_output' : (path.split('.').at(-1) ?? path))

export function formatChangeDelta(before: FieldValue, after: FieldValue, path: string) {
  const numeric = typeof before === 'number' && typeof after === 'number'

  const price =
    priceMeters[path] !== undefined && typeof before === 'string' && typeof after === 'string'

  if ((!numeric && !price) || path === 'pricing.discount') {
    return null
  }

  const delta = relativeChange(before, after)
  return delta === null ? null : { ...delta, isGood: price ? !delta.isUp : delta.isUp }
}
