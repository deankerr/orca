import { compareNumbers, relativeChangeAtLeast } from '../../../numbers'
import type { AlertChange, EntityAlert } from './curate'

/**
 * Scheduled pricing only announces override changes. Other pricing suppresses discount
 * adjustments of at most 2 percentage points, then requires a meter moving by 2% or more.
 * A meter ORCA cannot read is unquoted, like an absent one.
 * Without a schedule change or eligible meter, there is no pricing notification.
 * Lifecycle and non-pricing events remain outside this rule.
 *
 * ponytail: suppress the whole event, including any coincident metadata edits.
 * Revisit field-level filtering when missing those edits warrants the complexity.
 */
export function isEligible(event: EntityAlert): boolean {
  if (event.type !== 'endpoint_updated') {
    return true
  }

  const pricing = event.changes.filter((change) => change.field.startsWith('pricing.'))

  if (pricing.length > 0 && event.pricing_is_scheduled === true) {
    return pricing.some((change) => change.field === 'pricing.overrides')
  }

  const discount = pricing.find((change) => change.kind === 'percent')

  if (
    discount?.kind === 'percent' &&
    // Discounts are fractions; tolerate floating-point subtraction at the inclusive boundary.
    Math.abs(discount.after - discount.before) <= 0.02 + Number.EPSILON
  ) {
    return false
  }

  return pricing.length === 0 || pricing.some(significantMeterChange)
}

/** Unquoted and zero both mean unmetered; a transition between metered and unmetered qualifies. */
function significantMeterChange(change: AlertChange): boolean {
  if (change.kind !== 'price') {
    return false
  }

  const before = change.before ?? '0'
  const after = change.after ?? '0'
  const metered = (rate: string) => compareNumbers(rate, 0) === 1

  if (!metered(before) || !metered(after)) {
    return metered(before) !== metered(after)
  }

  return relativeChangeAtLeast(before, after, 2)
}
