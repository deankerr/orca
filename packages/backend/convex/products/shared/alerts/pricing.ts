import type { z } from 'zod'

import type { Pricing } from '../../../catalog/pricing'
import { priceMeters as meters } from '../../../priceMeters'

interface PriceMeters {
  [path: string]: { label: string; scale: number; unit: string }
}

/** Contract price fields and their alert labels use the shared meter units and decimal scaling. */
// oxlint-disable sort-keys -- Object.keys order sets the price order in Discord endpoint cards.
export const priceMeters: PriceMeters = {
  'pricing.input': { label: 'input', ...meters.prompt },
  'pricing.output': { label: 'output', ...meters.completion },
  'pricing.input_cache_read': { label: 'cache_read', ...meters.input_cache_read },
  'pricing.input_cache_write': { label: 'cache_write', ...meters.input_cache_write },
  'pricing.input_cache_write_1h': { label: 'cache_write_1h', ...meters.input_cache_write_1h },
  'pricing.audio': { label: 'audio_input', ...meters.audio },
  'pricing.audio_output': { label: 'audio_output', ...meters.audio_output },
  'pricing.input_audio_cache': { label: 'audio_cache', ...meters.input_audio_cache },
  'pricing.image': { label: 'image_input', ...meters.image },
  'pricing.image_output': { label: 'image_output', ...meters.image_output },
  'pricing.web_search': { label: 'web_search', ...meters.web_search },
}
// oxlint-enable sort-keys

/** Detect schedule evidence without interpreting or constraining upstream conditions. */
export function isScheduledPricing(pricing: z.infer<typeof Pricing>): boolean {
  return (
    pricing.overrides?.some((row) => Object.keys(row).some((key) => key.startsWith('utc'))) ?? false
  )
}
