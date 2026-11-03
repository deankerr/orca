import { compareNumbers, formatPrice } from '@orca/backend/numbers'

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
