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

/** A whole number such as tokens per second. */
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

/**
 * A quoted rate in $/M for a table cell: always three decimals (`$0.500`, `$15.000`) so the
 * decimal points line up down a right-aligned column. `$0` when free, a dash when absent. A
 * nonzero rate that three decimals would erase (`$0.000`) falls back to `formatRate`.
 */
export function formatRateCell(rate: string | null): string {
  const full = formatRate(rate)

  if (rate === null || full === null || full === '$0') {
    return full ?? ABSENT
  }

  const amount = formatNumber(rate, {
    minimumFractionDigits: 3,
    scale: 6,
    significantDigits: 0,
  })

  return amount === null || amount === '0.000' ? full : `$${amount}`
}

/**
 * Median latency in seconds from milliseconds, with an `s` suffix: two decimals under 10 s
 * (`0.12s`), one from 10 s to under 100 s (`54.7s`), whole seconds from 100 s (`120s`). The
 * precision follows the rounded value, so 9,996 ms reads `10.0s`, not `10.00s`.
 */
export function formatLatency(milliseconds: number | null): string {
  if (milliseconds === null) {
    return ABSENT
  }

  const hundredths = Math.round(milliseconds / 10)

  if (hundredths < 1000) {
    return `${(hundredths / 100).toFixed(2)}s`
  }

  const tenths = Math.round(milliseconds / 100)

  if (tenths < 1000) {
    return `${(tenths / 10).toFixed(1)}s`
  }

  return `${formatNumber(Math.round(milliseconds / 1000)) ?? ABSENT}s`
}

/** The scan time as shown in the status bar: `scan 2026-10-27 23:40 UTC`, or `no scan yet`. */
export function formatScanTime(at: string | null): string {
  if (at === null) {
    return 'no scan yet'
  }

  const time = new UTCDateMini(at)

  return isValid(time) ? `scan ${format(time, 'yyyy-MM-dd HH:mm')} UTC` : ABSENT
}
