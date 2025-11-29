import { formatDistanceToNow } from 'date-fns'

type PricingFormat = {
  transform: (value: number) => number
  unit: string
}

// Pricing format configurations using our schema keys
const pricingFormats: Record<string, PricingFormat> = {
  // Per-token pricing (display per million tokens)
  text_input: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  text_output: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  internal_reasoning: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  cache_read: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  cache_write: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  audio_input: { transform: (v) => v * 1_000_000, unit: '/MTOK' },
  audio_cache_input: { transform: (v) => v * 1_000_000, unit: '/MTOK' },

  // Per-unit pricing (display per thousand units)
  image_input: { transform: (v) => v * 1_000, unit: '/1K IMAGES' },
  image_output: { transform: (v) => v * 1_000, unit: '/1K IMAGES' },

  // Per-request pricing
  request: { transform: (v) => v, unit: '' },
  web_search: { transform: (v) => v, unit: '' },

  // Percentage (discount)
  discount: { transform: (v) => v * 100, unit: '%' },
}

// Key mappings from raw API keys to our schema keys
const rawKeyMappings: Record<string, string> = {
  // Raw API keys -> our schema keys
  prompt: 'text_input',
  completion: 'text_output',
  image: 'image_input',
  internal_reasoning: 'internal_reasoning',
  request: 'request',
  cache_read: 'cache_read',
  cache_write: 'cache_write',
  web_search: 'web_search',
  discount: 'discount',
  audio: 'audio_input',
  input_audio_cache: 'audio_cache_input',
  input_cache_read: 'cache_read',
  input_cache_write: 'cache_write',
  image_output: 'image_output',

  // public api
  audio_cache_write: 'audio_cache_input',
}

export function formatPrice({
  priceKey,
  priceValue,
  unitPrefix = true,
  unitSuffix = true,
}: {
  priceKey: string
  priceValue: number
  unitPrefix?: boolean
  unitSuffix?: boolean
}): string {
  // Map from raw API keys to our schema keys if needed
  const schemaKey = rawKeyMappings[priceKey] || priceKey

  // Get the format configuration
  const format = pricingFormats[schemaKey]

  if (!format) {
    return String(priceValue)
  }

  const transformedValue = format.transform(priceValue)

  // Special handling for discount (percentage formatting)
  if (schemaKey === 'discount') {
    const formattedValue = transformedValue.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    const suffix = unitSuffix ? format.unit : ''
    return `${formattedValue}${suffix}`
  }

  const formattedValue = transformedValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  })

  const prefix = unitPrefix ? '$' : ''
  const suffix = unitSuffix ? format.unit : ''
  return `${prefix}${formattedValue}${suffix}`
}

export function formatRelativeTime(timestamp: number): string {
  return formatDistanceToNow(timestamp, { addSuffix: true })
}

/**
 * Format a timestamp as a readable date-time string for display
 * Uses ISO format with space separator for readability
 */

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date
    .toLocaleString('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(',', '')
}

/**
 * Format a timestamp as a readable date-time string for display in UTC
 * Uses ISO format with space separator for readability
 */

export function formatDateTimeUTC(timestamp: number): string {
  const date = new Date(timestamp)
  return date
    .toLocaleString('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    })
    .replace(',', '')
}
