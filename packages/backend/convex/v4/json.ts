import { isPlainObject } from 'remeda'

/** Stable keys; Catalog also normalizes string arrays like V3 metadata, while pricing keeps order. */
export function canonicalJson(value: unknown, { sortStringArrays = false } = {}): string {
  return JSON.stringify(value, (_key, nested: unknown) => {
    if (
      sortStringArrays &&
      Array.isArray(nested) &&
      nested.every((item) => typeof item === 'string')
    ) {
      return nested.toSorted()
    }

    return isPlainObject(nested)
      ? Object.fromEntries(
          Object.entries(nested).toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : nested
  })
}
