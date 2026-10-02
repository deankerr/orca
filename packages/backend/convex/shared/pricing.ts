// Product pricing: format known display keys. Client-importable (convex/shared).
//
// Three display rules — not a per-key table:
//   discount  → value×100 + '%'
//   image_*   → $ ×1000 / KTOK
//   default   → $ ×1,000,000 / MTOK
//
// `web_search` is on the projection for the native-search cap, not a listed
// price. Callers that render it own that display.

import * as R from 'remeda'

type PriceKey =
  | 'text_input'
  | 'text_output'
  | 'cache_read'
  | 'cache_write'
  | 'audio_input'
  | 'audio_cache_read'
  | 'image_input'
  | 'image_output'
  | 'discount'

export type FormattedPrice = {
  field: PriceKey
  value: string
  unit: string
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
