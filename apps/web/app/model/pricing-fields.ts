import { PRICING_FIELD_KEYS } from '@orca/backend/shared/formatters'
import type { PricingKey } from '@orca/backend/shared/formatters'

type PricingMetricMetadata = {
  key: PricingKey
  label: string
  historyUnitLabel: string
  alwaysCompare: boolean
}

const PRICING_LABELS = {
  text_input: 'Input',
  text_output: 'Output',
  text_cache_read: 'Cache Read',
  text_cache_write: 'Cache Write',
  reasoning_output: 'Reasoning',
  audio_input: 'Audio Input',
  audio_cache_write: 'Audio Cache',
  image_input: 'Image Input',
  image_output: 'Image Output',
  web_search: 'Web Search',
  discount: 'Discount',
} as const satisfies Record<PricingKey, string>

const HISTORY_UNIT_LABELS = {
  text_input: 'USD per million tokens',
  text_output: 'USD per million tokens',
  text_cache_read: 'USD per million tokens',
  text_cache_write: 'USD per million tokens',
  reasoning_output: 'USD per million tokens',
  audio_input: 'USD per million tokens',
  audio_cache_write: 'USD per million tokens',
  image_input: 'USD per thousand images',
  image_output: 'USD per thousand images',
  web_search: 'USD per request',
  discount: 'Discount percentage',
} as const satisfies Record<PricingKey, string>

/** Shared ordering and labels for the comparison table and history selector. */
export const PRICING_METRICS: readonly PricingMetricMetadata[] = PRICING_FIELD_KEYS.map((key) => ({
  key,
  label: PRICING_LABELS[key],
  historyUnitLabel: HISTORY_UNIT_LABELS[key],
  alwaysCompare: key === 'text_input' || key === 'text_output',
}))

export function pricingMetricMetadata(metric: PricingKey): PricingMetricMetadata {
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

export function isPricingMetric(value: string): value is PricingKey {
  return PRICING_FIELD_KEYS.some((metric) => metric === value)
}
