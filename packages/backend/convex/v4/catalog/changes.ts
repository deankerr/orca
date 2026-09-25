import { omit } from 'convex-helpers'
import { isDeepEqual } from 'remeda'

/** Observation time alone does not change a Catalog row. */
export function changedRows<T extends { scan_at: string }>(
  previous: Map<string, T>,
  next: Map<string, T>,
): T[] {
  return [...next.entries()].flatMap(([id, row]) => {
    const before = previous.get(id)
    return before === undefined || !isDeepEqual(omit(before, ['scan_at']), omit(row, ['scan_at']))
      ? [row]
      : []
  })
}

/** Rows observed in the previous scan and absent from the next. */
export function departedRows<T>(previous: Map<string, T>, next: Map<string, T>): T[] {
  return [...previous].flatMap(([id, row]) => (next.has(id) ? [] : [row]))
}
