import { PRICING_FIELD_KEYS } from '@orca/backend/convex/shared/formatters'

type ShownPricingKey = (typeof PRICING_FIELD_KEYS)[number]

type PricingMetricMetadata = {
  key: ShownPricingKey
  label: string
  historyUnitLabel: string
  alwaysCompare: boolean
}

const PRICING_LABELS = {
  text_input: 'Input',
  text_output: 'Output',
  cache_read: 'Cache Read',
  cache_write: 'Cache Write',
  audio_input: 'Audio Input',
  audio_cache_read: 'Audio Cache',
  image_input: 'Image Input',
  image_output: 'Image Output',
  discount: 'Discount',
} as const satisfies Record<ShownPricingKey, string>

const HISTORY_UNIT_LABELS = {
  text_input: '$ / MTOK',
  text_output: '$ / MTOK',
  cache_read: '$ / MTOK',
  cache_write: '$ / MTOK',
  audio_input: '$ / MTOK',
  audio_cache_read: '$ / MTOK',
  image_input: '$ / KTOK',
  image_output: '$ / KTOK',
  discount: '%',
} as const satisfies Record<ShownPricingKey, string>

/** Shared ordering and labels for the comparison table and history selector. */
export const PRICING_METRICS: readonly PricingMetricMetadata[] = PRICING_FIELD_KEYS.map((key) => ({
  key,
  label: PRICING_LABELS[key],
  historyUnitLabel: HISTORY_UNIT_LABELS[key],
  alwaysCompare: key === 'text_input' || key === 'text_output',
}))

export function pricingMetricMetadata(metric: ShownPricingKey): PricingMetricMetadata {
  // PRICING_METRICS is exhaustive by construction; this fallback keeps the
  // function total if data from a newer backend reaches an older client.
  return (
    PRICING_METRICS.find(({ key }) => key === metric) ?? {
      key: metric,
      label: metric,
      historyUnitLabel: 'Price',
      alwaysCompare: false,
    }
  )
}

export function isPricingMetric(value: string): value is ShownPricingKey {
  return PRICING_FIELD_KEYS.some((metric) => metric === value)
}

export type { ShownPricingKey }
