import { omit } from 'convex-helpers'

import { compare } from '../compare'
import type { JsonValue } from '../json'

/** Observation time alone does not change a Catalog row. */
export function changedRows<T extends { scan_at: string; [key: string]: JsonValue }>(
  previous: Map<string, T>,
  next: Map<string, T>,
): T[] {
  return [...next.entries()].flatMap(([id, row]) => {
    const before = previous.get(id)
    return before === undefined ||
      compare(omit(before, ['scan_at']), omit(row, ['scan_at'])).length > 0
      ? [row]
      : []
  })
}

/** Rows observed in the previous scan and absent from the next. */
export function departedRows<T>(previous: Map<string, T>, next: Map<string, T>): T[] {
  return [...previous].flatMap(([id, row]) => (next.has(id) ? [] : [row]))
}
