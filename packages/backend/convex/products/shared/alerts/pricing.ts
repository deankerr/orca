import type { z } from 'zod'

import type { Pricing } from '../../../catalog/pricing'
import { compareNumbers, relativeChangeAtLeast } from '../../../numbers'
import type { AlertChange } from './curate'

/** Detect schedule evidence without interpreting or constraining upstream conditions. */
export function isScheduledPricing(pricing: z.infer<typeof Pricing>): boolean {
  return (
    pricing.overrides?.some((row) => Object.keys(row).some((key) => key.startsWith('utc'))) ?? false
  )
}

const isPricing = (change: AlertChange) => change.field.startsWith('pricing.')

/**
 * Override changes are coarse schedule changes. Override row order has been stable upstream, so a
 * reorder intentionally counts as a change; we do not interpret condition equivalence.
 */
const isSchedule = (change: AlertChange) => change.field === 'pricing.overrides'

/**
 * The endpoint changes pricing lets an alert announce, or null when pricing suppresses the update.
 *
 * Under a schedule, only schedule changes are announced; current-band price movement is not, and an
 * update whose only pricing movement is current-band is suppressed. Without a schedule, override
 * changes, such as prompt-length conditions, are not announced. Discount adjustments of at most
 * 2 percentage points suppress the update; otherwise pricing needs a meter moving by 2% or more.
 * A meter ORCA cannot read is unquoted, like an absent one.
 *
 * ponytail: suppress the whole update, including any coincident metadata edits.
 * Revisit field-level filtering when missing those edits warrants the complexity.
 */
export function announcedPricing(
  changes: AlertChange[],
  scheduled: boolean | undefined,
): AlertChange[] | null {
  if (scheduled === true) {
    const pricing = changes.filter(isPricing)

    return pricing.length > 0 && !pricing.some(isSchedule)
      ? null
      : changes.filter((change) => !isPricing(change) || isSchedule(change))
  }

  const announced = changes.filter((change) => !isSchedule(change))
  const pricing = announced.filter(isPricing)

  if (pricing.length === 0) {
    return announced
  }

  return isMinorDiscountAdjustment(pricing) || !pricing.some(significantMeterChange)
    ? null
    : announced
}

function isMinorDiscountAdjustment(pricing: AlertChange[]): boolean {
  const discount = pricing.find((change) => change.kind === 'percent')

  // Discounts are fractions; tolerate floating-point subtraction at the inclusive boundary.
  return (
    discount?.kind === 'percent' &&
    Math.abs(discount.after - discount.before) <= 0.02 + Number.EPSILON
  )
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
