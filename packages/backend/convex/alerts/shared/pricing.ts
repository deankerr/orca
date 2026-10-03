import { priceMeters as meters } from '../../priceMeters'

/** Alert paths and labels use the shared meter units and decimal scaling. */
export const priceMeters: Record<string, { label: string; scale: number; unit: string }> = {
  'pricing.prompt': { label: 'input', ...meters.prompt },
  'pricing.completion': { label: 'output', ...meters.completion },
  'pricing.input_cache_read': { label: 'cache_read', ...meters.input_cache_read },
  'pricing.input_cache_write': { label: 'cache_write', ...meters.input_cache_write },
  'pricing.input_cache_write_1h': { label: 'cache_write_1h', ...meters.input_cache_write_1h },
  'pricing.audio': { label: 'audio_input', ...meters.audio },
  'pricing.input_audio_cache': { label: 'audio_cache', ...meters.input_audio_cache },
  'pricing.image': { label: 'image_input', ...meters.image },
  'pricing.image_output': { label: 'image_output', ...meters.image_output },
  'pricing.web_search': { label: 'web_search', ...meters.web_search },
}
