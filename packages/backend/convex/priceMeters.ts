// oxlint-disable sort-keys -- Key order is the display order of price meters (Object.keys/entries consumers).
/** Decimal scaling exponents, units, and discount applicability for upstream price meters. */
export const priceMeters = {
  prompt: { scale: 6, unit: 'MTOK', discounted: true },
  completion: { scale: 6, unit: 'MTOK', discounted: true },
  input_cache_read: { scale: 6, unit: 'MTOK', discounted: true },
  input_cache_write: { scale: 6, unit: 'MTOK', discounted: true },
  input_cache_write_1h: { scale: 6, unit: 'MTOK', discounted: true },
  audio: { scale: 6, unit: 'MTOK', discounted: true },
  audio_output: { scale: 6, unit: 'MTOK', discounted: true },
  input_audio_cache: { scale: 6, unit: 'MTOK', discounted: true },
  image: { scale: 3, unit: 'KTOK', discounted: true },
  image_output: { scale: 3, unit: 'KTOK', discounted: true },
  web_search: { scale: 0, unit: 'search', discounted: false },
}
// oxlint-enable sort-keys
