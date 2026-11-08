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

  it('expands Filters for a value this version does not know', () => {
    expect(parseFiltersCollapsed('hidden')).toBe(false)
    expect(parseFiltersCollapsed('Collapsed')).toBe(false)
  })

  it('expands Filters for a malformed cookie instead of throwing', () => {
    const value = cookieValue('orca-filters=%', 'orca-filters')

    expect(parseFiltersCollapsed(value)).toBe(false)
    expect(parseFiltersCollapsed(cookieValue('orca-filters=%E0%A4%A', 'orca-filters'))).toBe(false)
  })
})

describe('cookieValue', () => {
  it('finds a cookie among others', () => {
    expect(cookieValue('a=1; orca-filters=collapsed; b=2', 'orca-filters')).toBe('collapsed')
  })

  it('does not match a cookie whose name only ends with the name', () => {
    expect(cookieValue('x-orca-filters=collapsed', 'orca-filters')).toBeUndefined()
  })

  it('keeps an equals sign in the value, and leaves it undecoded', () => {
    expect(cookieValue('k=a%20b=c', 'k')).toBe('a%20b=c')
  })

  it('reads a malformed percent escape without throwing', () => {
    expect(cookieValue('orca-filters=%', 'orca-filters')).toBe('%')
  })

  it('is undefined when the cookie is not set', () => {
    expect(cookieValue('', 'orca-filters')).toBeUndefined()
  })
})
