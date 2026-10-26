import type { z } from 'zod'

import type { Pricing } from '../../../catalog/pricing'
import {
  compareNumbers,
  multiplyNumbers,
  relativeChangeAtLeast,
  subtractNumbers,
} from '../../../numbers'
import type { AlertChange } from './curate'
import { priceFields } from './present'

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
 * changes, such as prompt-length conditions, are not announced. Pricing needs a meter moving by 2% or
 * more, and only qualifying meters are announced. A meter ORCA cannot read is unquoted, like an absent one.
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

  const discount = pricing.find((change) => change.kind === 'percent')
  const qualifies = (change: AlertChange) => significantMeterChange(change, discount)

  return pricing.some(qualifies)
    ? announced.filter((change) => change.kind !== 'price' || qualifies(change))
    : null
}

/**
 * Unquoted and zero both mean unmetered; a transition between metered and unmetered qualifies.
 * Presented discounted rates already include discount, so when discount also moves, the
 * undiscounted list rate must move too: an 80% → 82% discount alone moves presented rates by 10%.
 */
function significantMeterChange(
  change: AlertChange,
  discount: Extract<AlertChange, { kind: 'percent' }> | undefined,
): boolean {
  if (change.kind !== 'price') {
    return false
  }

  const before = change.before ?? '0'
  const after = change.after ?? '0'
  const metered = (rate: string) => compareNumbers(rate, 0) === 1

  if (!metered(before) || !metered(after)) {
    return metered(before) !== metered(after)
  }

  return (
    relativeChangeAtLeast(before, after, 2) &&
    (discount === undefined ||
      priceFields[change.field]?.discounted === false ||
      listRateChangeAtLeast(before, after, discount, 2))
  )
}

/** Compare before/(1 − d₀) with after/(1 − d₁) exactly, by cross-multiplying the complements. */
function listRateChangeAtLeast(
  before: string,
  after: string,
  discount: Extract<AlertChange, { kind: 'percent' }>,
  minimumPercent: number,
): boolean {
  const beforeComplement = subtractNumbers(1, discount.before)
  const afterComplement = subtractNumbers(1, discount.after)

  if (beforeComplement === null || afterComplement === null) {
    return true
  }

  const scaledBefore = multiplyNumbers(before, afterComplement)
  const scaledAfter = multiplyNumbers(after, beforeComplement)

  return (
    scaledBefore === null ||
    scaledAfter === null ||
    relativeChangeAtLeast(scaledBefore, scaledAfter, minimumPercent)
  )
}
