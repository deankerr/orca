// Shared formatting for pricing, change values, and deltas.
//
// Used by Discord embeds and monitor UIs. This module is client-importable
// (convex/shared may be imported by the frontend app).

import * as R from 'remeda'

import type { ORCAEndpoint } from '../db/or/views/endpoints'

// -- Pricing fields
//
// Single source of truth for pricing field metadata and display formatting.
// Object key order determines display order in shared helpers.

type ORCAEndpointPricing = ORCAEndpoint['pricing']
type PricingKey = keyof ORCAEndpointPricing

type PricingConfig = {
  scale: number
  unit: string
}

export const PRICING_FIELDS = {
  text_input: { scale: 1_000_000, unit: 'MTOK' },
  text_output: { scale: 1_000_000, unit: 'MTOK' },
  text_cache_read: { scale: 1_000_000, unit: 'MTOK' },
  text_cache_write: { scale: 1_000_000, unit: 'MTOK' },
  reasoning_output: { scale: 1_000_000, unit: 'MTOK' },
  audio_input: { scale: 1_000_000, unit: 'MTOK' },
  audio_cache_write: { scale: 1_000_000, unit: 'MTOK' },
  image_input: { scale: 1000, unit: '1K IMG' },
  image_output: { scale: 1000, unit: '1K IMG' },
  web_search: { scale: 1, unit: 'REQ' },
  discount: { scale: 100, unit: '' },
} as const satisfies Record<PricingKey, PricingConfig>

const PRICING_FIELD_KEYS = [
  'text_input',
  'text_output',
  'text_cache_read',
  'text_cache_write',
  'reasoning_output',
  'audio_input',
  'audio_cache_write',
  'image_input',
  'image_output',
  'web_search',
  'discount',
] as const satisfies readonly PricingKey[]

export type PricingFormatResult = {
  field: string
  value: string
  unit: string
}

function isPricingKey(key: string): key is PricingKey {
  return PRICING_FIELD_KEYS.some((pricingKey) => pricingKey === key)
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
    maximumFractionDigits: 4,
  })

  const display = field === 'discount' ? `${formatted}%` : `$${formatted}`
  return { field, value: display, unit: PRICING_FIELDS[field].unit }
}

export function formatPricingFields(pricing: Partial<ORCAEndpointPricing>): PricingFormatResult[] {
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

export function parsePricingPath(path: string): PricingKey | null {
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

export function fmtScalar(value: unknown): string {
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

export type Delta = {
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
