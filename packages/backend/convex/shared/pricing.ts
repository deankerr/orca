// Product pricing: format a known key, or walk whatever is present on a
// projected pricing object. Client-importable (convex/shared).
//
// Three display rules — not a per-key table:
//   discount  → value×100 + '%'
//   image_*   → $ ×1000 / KTOK
//   default   → $ ×1,000,000 / MTOK
//
// `web_search` is on the projection for the native-search cap, not a listed
// price. Callers that render it own that display.

import * as R from 'remeda'

import type { EndpointProjection } from '../catalog/endpoints'

export type Pricing = EndpointProjection['pricing']
export type PricingKey = keyof Pricing
export type PriceKey = Exclude<PricingKey, 'web_search'>

export const PRICE_KEYS = [
  'text_input',
  'text_output',
  'cache_read',
  'cache_write',
  'audio_input',
  'audio_cache_read',
  'image_input',
  'image_output',
  'discount',
] as const satisfies readonly PriceKey[]

true satisfies Exclude<PriceKey, (typeof PRICE_KEYS)[number]> extends never ? true : false

export type FormattedPrice = {
  field: PriceKey
  value: string
  unit: string
}

function isPriceKey(key: string): key is PriceKey {
  for (const priceKey of PRICE_KEYS) {
    if (priceKey === key) {
      return true
    }
  }
  return false
}

function pricingStyle(key: PriceKey): {
  scale: number
  unit: string
  kind: 'money' | 'percent'
} {
  if (key === 'discount') {
    return { scale: 100, unit: '', kind: 'percent' }
  }
  if (key === 'image_input' || key === 'image_output') {
    return { scale: 1000, unit: 'KTOK', kind: 'money' }
  }
  return { scale: 1_000_000, unit: 'MTOK', kind: 'money' }
}

export function pricingKeyFromPath(path: string): PriceKey | null {
  if (!path.startsWith('pricing.')) {
    return null
  }
  const key = path.slice('pricing.'.length)
  if (!isPriceKey(key)) {
    return null
  }
  return key
}

export function pricingScale(key: PriceKey): number {
  return pricingStyle(key).scale
}

export function pricingUnit(key: PriceKey): string {
  return pricingStyle(key).unit
}

export function formatPricing(key: PriceKey, value: number | undefined): FormattedPrice | null {
  if (!R.isDefined(value) || !Number.isFinite(value)) {
    return null
  }

  const { scale, unit, kind } = pricingStyle(key)
  const scaled = value * scale
  const formatted = scaled.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: scaleFractionalDigits(scaled),
  })

  return {
    field: key,
    value: kind === 'percent' ? `${formatted}%` : `$${formatted}`,
    unit,
  }
}

/** Present prices in `PRICE_KEYS` order. `web_search` is not a listed price. */
export function formatPricingFields(pricing: Partial<Pricing>): FormattedPrice[] {
  return PRICE_KEYS.flatMap((key) => {
    const formatted = formatPricing(key, pricing[key])
    return formatted ? [formatted] : []
  })
}

export function computePricingDelta(
  key: PriceKey,
  before: unknown,
  after: unknown,
): { pct: number; isUp: boolean; isGood: boolean } | null {
  if (!R.isNumber(before) || !R.isNumber(after) || before === 0) {
    return null
  }

  const pct = ((after - before) / before) * 100
  const isUp = after > before
  return { pct, isUp, isGood: key === 'discount' ? isUp : !isUp }
}

function scaleFractionalDigits(value: number): number {
  if (value <= 0 || !Number.isFinite(value)) {
    return 2
  }
  if (value >= 0.01) {
    return 2
  }
  const magnitude = Math.floor(Math.log10(value))
  return Math.max(2, -magnitude + 1)
}
