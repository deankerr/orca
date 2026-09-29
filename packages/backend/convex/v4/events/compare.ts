import { diff } from 'json-diff-ts'

/** Discover string arrays in both observations, including fields first seen upstream. */
export function compare(previous: unknown, next: unknown) {
  const embeddedObjKeys = new Map<string, string>()

  function visit(value: unknown, path: string) {
    if (Array.isArray(value)) {
      // ponytail: $value ignores duplicate counts; revisit only if multiplicity becomes meaningful.
      const stringArray = value.every((item) => typeof item === 'string')
      embeddedObjKeys.set(
        path,
        stringArray && embeddedObjKeys.get(path) !== '$index' ? '$value' : '$index',
      )
      // The library omits array indices from configured paths, including nested object arrays.
      for (const item of value) {
        visit(item, path)
      }
    } else if (value !== null && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        visit(item, path === '' ? key : `${path}.${key}`)
      }
    }
  }

  visit(previous, '')
  visit(next, '')
  // Keep scalar/null transitions as UPDATEs; accepted library limits are in docs/events/payloads.md.
  return diff(previous, next, { embeddedObjKeys, treatTypeChangeAsReplace: false })
}
