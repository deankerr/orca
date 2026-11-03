import { UTCDateMini } from '@date-fns/utc'
import { formatNumber } from '@orca/backend/numbers'
import { format, isValid } from 'date-fns'

import { formatRate } from '#features/endpoints/rate'

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

/** A quoted rate in $/M from its upstream decimal string: `$0` when free, a dash when absent. */
export function formatRateCell(rate: string | null): string {
  return formatRate(rate) ?? ABSENT
}

/** The scan time as shown in the status bar: `scan 2026-10-27 23:40 UTC`. */
export function formatScanTime(at: string): string {
  const time = new UTCDateMini(at)

  return isValid(time) ? `scan ${format(time, 'yyyy-MM-dd HH:mm')} UTC` : ABSENT
}
