import { omit } from 'convex-helpers'
import { isDeepEqual } from 'remeda'

/** Observation time alone does not change a Catalog row. */
export function changedRows<T extends { scan_at: string }>(
  previous: Map<string, T> | null,
  next: Map<string, T>,
): T[] {
  return [...next.entries()].flatMap(([id, row]) => {
    const before = previous?.get(id)
    return before === undefined || !isDeepEqual(omit(before, ['scan_at']), omit(row, ['scan_at']))
      ? [row]
      : []
  })
}
