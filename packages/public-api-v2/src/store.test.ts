import { describe, expect, test } from 'bun:test'

import { observedAtToIso } from './store.ts'

describe('observedAtToIso', () => {
  test('converts capture path key (colons dashed) to ISO', () => {
    expect(observedAtToIso('2026-08-11T12-34-56Z')).toBe('2026-08-11T12:34:56.000Z')
  })

  test('normalizes already-ISO values', () => {
    expect(observedAtToIso('2026-08-11T12:34:56.000Z')).toBe('2026-08-11T12:34:56.000Z')
  })
})
