const MTOK_SCALE = 1_000_000

export function formatNumber(value: number | undefined, maximumFractionDigits = 0) {
  if (value === undefined) {
    return 'n/a'
  }

  return value.toLocaleString('en-US', { maximumFractionDigits })
}

export function formatDate(timestamp: number | undefined) {
  if (timestamp === undefined) {
    return 'n/a'
  }

  return new Date(timestamp).toLocaleDateString('en-CA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatMtokPrice(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return 'n/a'
  }

  const scaled = value * MTOK_SCALE
  const formatted = scaled.toLocaleString('en-US', {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  })

  return `$${formatted}/MTOK`
}
