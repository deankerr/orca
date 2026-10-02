import type { EntityAlert, FieldChange } from './curate'
import { compareNumbers, relativeChangeAtLeast } from './numbers'

/**
 * Coarse notification policy: suppress discount adjustments of at most 2 percentage
 * points first, then require at least one eligible meter moving by 2% or more.
 * A malformed meter is ineligible, not a reason to let a 0.1% update through.
 * No eligible meters means no pricing notification; lifecycle and non-pricing
 * events remain outside this rule.
 *
 * ponytail: suppress the whole event, including any coincident metadata edits.
 * Revisit field-level filtering when missing those edits warrants the complexity.
 */
export function isEligible(event: EntityAlert): boolean {
  if (event.type !== 'endpoint_updated') {
    return true
  }

  const pricing = event.changes.filter((change) => change.path.split('.')[0] === 'pricing')
  const discount = pricing.find((change) => change.path === 'pricing.discount')

  if (
    discount?.type === 'field_updated' &&
    typeof discount.before === 'number' &&
    typeof discount.after === 'number' &&
    // Discounts are fractions; tolerate floating-point subtraction at the inclusive boundary.
    Math.abs(discount.after - discount.before) <= 0.02 + Number.EPSILON
  ) {
    return false
  }

  return pricing.length === 0 || pricing.some(significantMeterChange)
}

function significantMeterChange(change: FieldChange): boolean {
  if (
    change.path === 'pricing' ||
    change.path === 'pricing.discount' ||
    change.type === 'set_updated'
  ) {
    return false
  }

  // Absence and zero both mean unmetered. Only valid, nonnegative prices can
  // establish a transition to/from a metered value; invalid values cannot.
  const before = 'before' in change ? change.before : '0'
  const after = 'after' in change ? change.after : '0'

  if (typeof before !== 'string' || typeof after !== 'string') {
    return false
  }

  const old = compareNumbers(before, 0)
  const next = compareNumbers(after, 0)

  if (old === null || next === null || old < 0 || next < 0) {
    return false
  }

  if (old === 0 || next === 0) {
    return old !== next
  }

  return relativeChangeAtLeast(before, after, 2)
}
