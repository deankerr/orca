import { UTCDateMini } from '@date-fns/utc'
import { compareNumbers, formatNumber, formatPrice } from '@orca/backend/numbers'
import { format, isValid } from 'date-fns'

/** Shown where an endpoint has no value. */
export const ABSENT = '—'

const contextFormat = new Intl.NumberFormat('en', {
  maximumSignificantDigits: 3,
  notation: 'compact',
})

/** Context length in compact tokens: `1.05M`, `262K`, `128K`. */
export function formatContext(tokens: number | null): string {
  return tokens === null ? ABSENT : contextFormat.format(tokens)
}

/** A whole number such as tokens per second or milliseconds. */
export function formatCount(value: number | null): string {
  return (value === null ? null : formatNumber(Math.round(value))) ?? ABSENT
}

/**
 * A quoted rate for display: dollars per million tokens, from the per-token string in
 * `EndpointRow.rates`. Zero reads `$0`, not `$0.00`, because a free price is a fact rather than a
 * rounded amount. Null when the rate is absent.
 */
export function formatRate(rate: string | null): string | null {
  if (rate === null) {
    return null
  }

  return compareNumbers(rate, 0) === 0 ? '$0' : formatPrice(rate, 6)
}

/** A quoted rate in $/M from its upstream decimal string: `$0` when free, a dash when absent. */
export function formatRateCell(rate: string | null): string {
  return formatRate(rate) ?? ABSENT
}

/** The scan time as shown in the status bar: `scan 2026-10-27 23:40 UTC`, or `no scan yet`. */
export function formatScanTime(at: string | null): string {
  if (at === null) {
    return 'no scan yet'
  }

  const time = new UTCDateMini(at)

  return isValid(time) ? `scan ${format(time, 'yyyy-MM-dd HH:mm')} UTC` : ABSENT
}
