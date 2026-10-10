import { diff } from 'json-diff-ts'

import type { JsonValue } from './json'

/** Compare JSON using value matching for string arrays and index matching for other arrays. */
export function compare(previous: JsonValue, next: JsonValue) {
  const embeddedObjKeys = new Map<string, string>()

  function visit(value: JsonValue, path: string) {
    if (Array.isArray(value)) {
      const stringArray = value.every((item) => typeof item === 'string')
      // A non-string array on either side makes this path use index matching.
      embeddedObjKeys.set(
        path,
        stringArray && embeddedObjKeys.get(path) !== '$index' ? '$value' : '$index',
      )

      // json-diff-ts addresses items[0].tags and items[1].tags as the same path: items.tags.
      for (const item of value) {
        visit(item, path)
      }
    } else if (value !== null && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        visit(item, path === '' ? key : `${path}.${key}`)
      }
    }
  }

  // Discover array paths on both sides, including newly added and removed fields.
  visit(previous, '')
  visit(next, '')

  // Keep type transitions as single UPDATEs with complete before and after values.
  return diff(previous, next, { embeddedObjKeys, treatTypeChangeAsReplace: false })
}
