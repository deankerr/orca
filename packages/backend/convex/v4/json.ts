import { isPlainObject } from 'remeda'

/** Stable storage encoding prevents key-order changes from rewriting JSON-backed cache fields. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    isPlainObject(nested)
      ? Object.fromEntries(
          Object.entries(nested).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : nested,
  )
}
