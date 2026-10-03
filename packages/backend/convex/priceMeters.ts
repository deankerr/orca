/** Decimal scaling exponents and units for upstream price meters, shared across products. */
export const priceMeters = {
  prompt: { scale: 6, unit: 'MTOK' },
  completion: { scale: 6, unit: 'MTOK' },
  input_cache_read: { scale: 6, unit: 'MTOK' },
  input_cache_write: { scale: 6, unit: 'MTOK' },
  input_cache_write_1h: { scale: 6, unit: 'MTOK' },
  audio: { scale: 6, unit: 'MTOK' },
  input_audio_cache: { scale: 6, unit: 'MTOK' },
  image: { scale: 3, unit: 'KTOK' },
  image_output: { scale: 3, unit: 'KTOK' },
  web_search: { scale: 0, unit: 'search' },
}
