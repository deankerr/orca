import type { CuratedEvent, FieldChange } from './curate'
import { compareNumbers, relativeChangeAtLeast } from './numbers'

/**
 * Coarse notification policy: a pricing update needs at least one eligible meter
 * moving by 2% or more. Discount is already reflected in the meter prices.
 * A malformed meter is ineligible, not a reason to let a 0.1% update through.
 * No eligible meters means no pricing notification; lifecycle and non-pricing
 * events remain outside this rule.
 *
 * ponytail: suppress the whole event, including any coincident metadata edits.
 * Revisit field-level filtering when missing those edits warrants the complexity.
 */
export function shouldRender(event: CuratedEvent): boolean {
  if (event.type !== 'endpoint_updated') {
    return true
  }

  const pricing = event.changes.filter((change) => change.path.split('.')[0] === 'pricing')

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
