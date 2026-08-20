// Shared formatting for pricing, change values, and deltas.
//
// Used by Discord embeds and monitor UIs. This module is client-importable
// (convex/shared may be imported by the frontend app).

import * as R from 'remeda'

import type { EndpointProjection } from '../catalog/endpoints'

// -- Pricing fields
//
// PRICING_FIELDS covers every projected pricing key that can be formatted.
// PRICING_FIELD_KEYS is the display list for token/discount prices — not
// capability-only rates like web_search.

type EndpointProjectionPricing = EndpointProjection['pricing']
export type PricingKey = keyof EndpointProjectionPricing

type PricingConfig = {
  scale: number
  unit: string
}

const PRICING_FIELDS = {
  text_input: { scale: 1_000_000, unit: 'MTOK' },
  text_output: { scale: 1_000_000, unit: 'MTOK' },
  cache_read: { scale: 1_000_000, unit: 'MTOK' },
  cache_write: { scale: 1_000_000, unit: 'MTOK' },
  audio_input: { scale: 1_000_000, unit: 'MTOK' },
  audio_cache_read: { scale: 1_000_000, unit: 'MTOK' },
  image_input: { scale: 1000, unit: 'KTOK' },
  image_output: { scale: 1000, unit: 'KTOK' },
  web_search: { scale: 1, unit: '' },
  discount: { scale: 100, unit: '' },
} as const satisfies Record<PricingKey, PricingConfig>

export const PRICING_FIELD_KEYS = [
  'text_input',
  'text_output',
  'cache_read',
  'cache_write',
  'audio_input',
  'audio_cache_read',
  'image_input',
  'image_output',
  'discount',
] as const satisfies readonly PricingKey[]

type PricingFormatResult = {
  field: string
  value: string
  unit: string
}

function isPricingKey(key: string): key is PricingKey {
  return Object.hasOwn(PRICING_FIELDS, key)
}

export function formatPricing(
  field: PricingKey,
  value: number | undefined,
): PricingFormatResult | null {
  if (!R.isDefined(value) || !Number.isFinite(value)) {
    return null
  }

  const scaled = value * PRICING_FIELDS[field].scale
  const formatted = scaled.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: scaleFractionalDigits(scaled),
  })

  const display = field === 'discount' ? `${formatted}%` : `$${formatted}`
  return { field, value: display, unit: PRICING_FIELDS[field].unit }
}

/** Scale used by product surfaces that plot raw catalog prices on an axis. */
export function pricingScale(field: PricingKey): number {
  return PRICING_FIELDS[field].scale
}

const MINIMUM_PRICE_DELTA = 0.01
const MINIMUM_PRICE_RELATIVE_DELTA = 0.1
const MINIMUM_DISCOUNT_DELTA = 5

/**
 * Whether a numeric pricing update is large enough for user-facing change feeds.
 * Raw pricing history remains exact; this only suppresses sub-cent or low-percentage
 * price churn and discount moves smaller than five percentage points.
 */
export function isMaterialPricingUpdate(path: string, before: unknown, after: unknown): boolean {
  const field = parsePricingPath(path)
  if (!field || !R.isNumber(before) || !R.isNumber(after)) {
    return true
  }

  const scaledDelta = Math.abs(after - before) * PRICING_FIELDS[field].scale
  if (field === 'discount') {
    return scaledDelta >= MINIMUM_DISCOUNT_DELTA
  }

  const relativeDelta =
    before === 0 ? Number.POSITIVE_INFINITY : Math.abs(after - before) / Math.abs(before)
  return scaledDelta >= MINIMUM_PRICE_DELTA && relativeDelta >= MINIMUM_PRICE_RELATIVE_DELTA
}

// Compute decimal places to show the first significant digit plus one more,
// but only for sub-cent values — anything >= $0.01 uses standard 2 decimal places.
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

export function formatPricingFields(
  pricing: Partial<EndpointProjectionPricing>,
): PricingFormatResult[] {
  return PRICING_FIELD_KEYS.flatMap((field) => {
    const formatted = formatPricing(field, pricing[field])
    if (!formatted) {
      return []
    }
    return [formatted]
  })
}

// -- Path parsing

export function splitPath(path: string): { category: string | null; key: string } {
  const dotIndex = path.indexOf('.')
  if (dotIndex === -1) {
    return { category: null, key: path }
  }
  return { category: path.slice(0, dotIndex), key: path.slice(dotIndex + 1) }
}

function parsePricingPath(path: string): PricingKey | null {
  if (!path.startsWith('pricing.')) {
    return null
  }
  const key = path.slice('pricing.'.length)
  if (!isPricingKey(key)) {
    return null
  }
  return key
}

// -- Value formatting

export function fmtValue(value: unknown, path: string): string {
  // pricing fields delegate to the shared formatter
  const pricingField = parsePricingPath(path)
  if (R.isNonNullish(pricingField) && R.isNumber(value)) {
    return formatPricing(pricingField, value)?.value ?? fmtScalar(value)
  }

  return fmtScalar(value)
}

export function fmtUnit(path: string): string | null {
  const pricingField = parsePricingPath(path)
  if (!pricingField) {
    return null
  }
  const { unit } = PRICING_FIELDS[pricingField]
  return unit || null
}

function fmtScalar(value: unknown): string {
  if (!R.isDefined(value)) {
    return 'null'
  }
  if (R.isNumber(value)) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 6 })
  }
  if (R.isString(value)) {
    return value
  }
  if (R.isBoolean(value)) {
    return String(value)
  }
  return JSON.stringify(value)
}

// -- Delta computation

type Delta = {
  pct: number
  isUp: boolean
  isGood: boolean
}

// cost fields: pricing fields where increases are bad (everything except discount)
const COST_FIELDS = new Set(Object.keys(PRICING_FIELDS).filter((k) => k !== 'discount'))

export function computeDelta(before: unknown, after: unknown, path: string): Delta | null {
  if (!R.isNumber(before) || !R.isNumber(after) || before === 0) {
    return null
  }

  const pct = ((after - before) / before) * 100
  const isUp = after > before

  // cost fields: increase = bad. everything else (including discount): increase = good
  const pricingField = parsePricingPath(path)
  const isCost = R.isNonNullish(pricingField) && COST_FIELDS.has(pricingField)
  const isGood = isCost ? !isUp : isUp

  return { pct, isUp, isGood }
}
