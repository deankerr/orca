import {
  compareNumbers,
  multiplyNumbers,
  relativeChangeAtLeast,
  subtractNumbers,
} from '../../../numbers'
import type { AlertChange } from './curate'
import { priceFields } from './present'

const isPricing = (change: AlertChange) => change.field.startsWith('pricing.')

/** Curation has already dropped override changes that say nothing new, such as a reorder. */
const isCondition = (change: AlertChange) => change.field === 'pricing.overrides'

/**
 * The endpoint changes pricing lets an alert announce, or null when pricing suppresses the update.
 *
 * Under a schedule, only schedule changes are announced; current-band price movement is not, and an
 * update whose only pricing movement is current-band is suppressed. Without a schedule, a condition
 * change qualifies alongside any meter moving by 2% or more, and only qualifying meters are announced.
 * A meter ORCA cannot read is unquoted, like an absent one. An old Event without complete quotes has
 * no condition evidence, so its override change is not announced.
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

    return pricing.length > 0 && !pricing.some(isCondition)
      ? null
      : changes.filter((change) => !isPricing(change) || isCondition(change))
  }

  const announced =
    scheduled === undefined ? changes.filter((change) => !isCondition(change)) : changes

  const pricing = announced.filter(isPricing)

  if (pricing.length === 0) {
    return announced
  }

  const discount = pricing.find((change) => change.kind === 'percent')
  const qualifies = (change: AlertChange) => significantMeterChange(change, discount)

  return pricing.some((change) => isCondition(change) || qualifies(change))
    ? announced.filter((change) => change.kind !== 'price' || qualifies(change))
    : null
}

const metered = (rate: string) => compareNumbers(rate, 0) === 1

/** Unquoted and zero both mean unmetered; a transition between metered and unmetered qualifies. */
export const rateMoved = (before: string, after: string) =>
  metered(before) && metered(after)
    ? relativeChangeAtLeast(before, after, 2)
    : metered(before) !== metered(after)

/**
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

  if (!rateMoved(before, after)) {
    return false
  }

  return (
    !metered(before) ||
    !metered(after) ||
    discount === undefined ||
    priceFields[change.field]?.discounted === false ||
    listRateChangeAtLeast(before, after, discount, 2)
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
