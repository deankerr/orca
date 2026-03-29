import { type OrcaEndpointV2 } from '@/convex/transforms/endpoint'

// * Pricing Formatter
// Transforms raw pricing values (dollar per unit) into display format.
// Returns { value, unit } for flexible display: `${value}${unit}` -> "$1.23/MTOK"
// Handles untyped keys gracefully - unknown keys return raw value with blank unit.

type PricingFormatResult = {
  value: string
  unit: string
}

type PricingFormat = {
  transform: (value: number) => number
  unit: string
}

type PricingKey = keyof Omit<OrcaEndpointV2['pricing'], 'tiers'>

// Canonical pricing keys from PricingOutputSchema (convex/transforms/endpoint.ts)
const pricingFormats: Record<PricingKey, PricingFormat> = {
  // Per-token pricing (display per million tokens)
  text_input: { transform: (v) => v * 1_000_000, unit: 'MTOK' },
  text_output: { transform: (v) => v * 1_000_000, unit: 'MTOK' },
  text_cache_read: { transform: (v) => v * 1_000_000, unit: 'MTOK' },
  text_cache_write: { transform: (v) => v * 1_000_000, unit: 'MTOK' },
  reasoning_output: { transform: (v) => v * 1_000_000, unit: 'MTOK' },
  audio_input: { transform: (v) => v * 1_000_000, unit: 'MTOK' },
  audio_cache_write: { transform: (v) => v * 1_000_000, unit: 'MTOK' },

  // Per-image pricing (display per thousand images)
  image_input: { transform: (v) => v * 1_000, unit: '1K IMG' },
  image_output: { transform: (v) => v * 1_000, unit: '1K IMG' },

  // Per-request pricing
  per_request: { transform: (v) => v, unit: 'REQ' },
}

/**
 * Format a pricing value for display.
 *
 * @param key - Pricing key (e.g., "text_input"). If unrecognized, returns raw value.
 * @param value - Raw pricing value (number or numeric string). Dollar value per unit.
 * @returns { value: string, unit: string } or null if inputs are null.
 *
 * Usage: `${result.value}${result.unit}` -> "$1.23/MTOK"
 */
export function formatPricing(
  key: string | null,
  value: number | string | null,
): PricingFormatResult | null {
  if (key === null || value === null) return null

  // * coerce string to number
  const numericValue = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(numericValue)) {
    return { value: String(value), unit: '' }
  }

  const format = pricingFormats[key as PricingKey]
  if (!format) {
    // Unknown key - return raw value formatted as number
    return { value: String(numericValue), unit: '' }
  }

  const transformedValue = format.transform(numericValue)
  const formatted = transformedValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })

  return {
    value: `$${formatted}`,
    unit: format.unit,
  }
}
