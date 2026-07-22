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
