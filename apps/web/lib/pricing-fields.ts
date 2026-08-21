import { PRICE_KEYS, pricingUnit } from '@orca/backend/convex/shared/pricing'
import type { PriceKey } from '@orca/backend/convex/shared/pricing'

type PricingMetricMetadata = {
  key: PriceKey
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
} as const satisfies Record<PriceKey, string>

/** Shared ordering and labels for the comparison table and history selector. */
export const PRICING_METRICS: readonly PricingMetricMetadata[] = PRICE_KEYS.map((key) => ({
  key,
  label: PRICING_LABELS[key],
  historyUnitLabel: key === 'discount' ? '%' : `$ / ${pricingUnit(key)}`,
  alwaysCompare: key === 'text_input' || key === 'text_output',
}))

export function pricingMetricMetadata(metric: PriceKey): PricingMetricMetadata {
  return (
    PRICING_METRICS.find(({ key }) => key === metric) ?? {
      key: metric,
      label: metric,
      historyUnitLabel: 'Price',
      alwaysCompare: false,
    }
  )
}

export function isPricingMetric(value: string): value is PriceKey {
  return Object.hasOwn(PRICING_LABELS, value)
}
