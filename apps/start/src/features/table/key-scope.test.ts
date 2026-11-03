import { describe, expect, it } from 'vitest'

import { TABLE_KEYS_ATTRIBUTE, tableOwnsKeys } from './key-scope'
import type { FocusProbe } from './key-scope'

const body: FocusProbe = { closest: () => null }

/** An element that sits inside a region with the given attribute, or inside none. */
function insideRegion(attribute?: string): FocusProbe {
  return { closest: (selector) => (selector === `[${attribute}]` ? {} : null) }
}

describe('tableOwnsKeys', () => {
  it('owns the keys when nothing has focus', () => {
    expect(tableOwnsKeys(null, body)).toBe(true)
    expect(tableOwnsKeys(body, body)).toBe(true)
  })

  it('owns the keys inside a marked region', () => {
    expect(tableOwnsKeys(insideRegion(TABLE_KEYS_ATTRIBUTE), body)).toBe(true)
  })

  it('leaves the keys to focus anywhere else', () => {
    expect(tableOwnsKeys(insideRegion(), body)).toBe(false)
    expect(tableOwnsKeys(insideRegion('data-other'), body)).toBe(false)
  })
})
