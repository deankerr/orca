import { describe, expect, it } from 'vitest'

import { cookieValue, parseFiltersCollapsed } from './filters-preference'

describe('parseFiltersCollapsed', () => {
  it('reads only `collapsed` as collapsed', () => {
    expect(parseFiltersCollapsed('collapsed')).toBe(true)
    expect(parseFiltersCollapsed('expanded')).toBe(false)
    expect(parseFiltersCollapsed('')).toBe(false)
  })

  it('expands Filters for a visitor with no cookie', () => {
    expect(parseFiltersCollapsed(undefined)).toBe(false)
  })
})

describe('cookieValue', () => {
  it('finds a cookie among others', () => {
    expect(cookieValue('a=1; orca-filters=collapsed; b=2', 'orca-filters')).toBe('collapsed')
  })

  it('does not match a cookie whose name only ends with the name', () => {
    expect(cookieValue('x-orca-filters=collapsed', 'orca-filters')).toBeUndefined()
  })

  it('keeps an equals sign in the value, and decodes it', () => {
    expect(cookieValue('k=a%20b=c', 'k')).toBe('a b=c')
  })

  it('is undefined when the cookie is not set', () => {
    expect(cookieValue('', 'orca-filters')).toBeUndefined()
  })
})
