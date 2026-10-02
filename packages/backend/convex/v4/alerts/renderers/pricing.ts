export const priceMeters: Record<string, { label: string; scale: number; unit: string }> = {
  'pricing.prompt': { label: 'input', scale: 6, unit: 'MTOK' },
  'pricing.completion': { label: 'output', scale: 6, unit: 'MTOK' },
  'pricing.input_cache_read': { label: 'cache_read', scale: 6, unit: 'MTOK' },
  'pricing.input_cache_write': { label: 'cache_write', scale: 6, unit: 'MTOK' },
  'pricing.input_cache_write_1h': { label: 'cache_write_1h', scale: 6, unit: 'MTOK' },
  'pricing.audio': { label: 'audio_input', scale: 6, unit: 'MTOK' },
  'pricing.input_audio_cache': { label: 'audio_cache', scale: 6, unit: 'MTOK' },
  'pricing.image': { label: 'image_input', scale: 3, unit: 'KTOK' },
  'pricing.image_output': { label: 'image_output', scale: 3, unit: 'KTOK' },
  'pricing.web_search': { label: 'web_search', scale: 0, unit: 'search' },
}
