import { stripSearchParams } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { stringifySearch } from '#lib/url-search-serializer'

import type { Scope } from './scope'
import {
  activeFilterCount,
  clearedFilters,
  scopeDefaults,
  scopeSchema,
  propertyState,
  setPropertyState,
  toggleValue,
} from './scope'

describe('scopeSchema', () => {
  it('fills defaults for a bare URL', () => {
    expect(scopeSchema.parse({})).toEqual(scopeDefaults)
  })

  it('splits comma lists, including single values the router parsed as other types', () => {
    expect(
      scopeSchema.parse({ model: 'openai/gpt-5,openai/gpt-5:free', provider: ['azure'] }),
    ).toMatchObject({
      model: ['openai/gpt-5', 'openai/gpt-5:free'],
      provider: ['azure'],
    })
    expect(scopeSchema.parse({ provider: 302 }).provider).toEqual(['302'])
    expect(scopeSchema.parse({ model: 'a,,a,b' }).model).toEqual(['a', 'b'])
  })

  it('reads bounds, windows, toggles, sort, and selection', () => {
    expect(
      scopeSchema.parse({
        endpoint: 'gpt-openai',
        maxInput: 2.5,
        minContext: 128_000,
        minTps: 50,
        plot: false,
        released: 6,
        sort: '-throughput',
        unlisted: true,
      }),
    ).toMatchObject({
      endpoint: 'gpt-openai',
      maxInput: 2.5,
      minContext: 128_000,
      minTps: 50,
      plot: false,
      released: 6,
      sort: '-throughput',
      unlisted: true,
    })
  })

  it('falls back to defaults for invalid values instead of failing', () => {
    expect(
      scopeSchema.parse({
        endpoint: '',
        maxInput: -1,
        minTps: 'fast',
        model: { nested: true },
        plot: 'yes',
        released: 2,
        sort: 'price',
        unlisted: 1,
      }),
    ).toEqual(scopeDefaults)
  })

  it('drops unknown properties and lets an included property win over its exclusion', () => {
    expect(scopeSchema.parse({ with: 'tools,bogus', without: 'tools,zdr' })).toMatchObject({
      with: ['tools'],
      without: ['zdr'],
    })
  })
})

describe('stripping defaults from URLs', () => {
  const strip = (scope: Scope) =>
    z
      .looseObject({})
      .parse(stripSearchParams(scopeDefaults)({ next: (next) => next, search: scope }))

  it('removes every param at its default', () => {
    expect(strip(scopeSchema.parse({}))).toEqual({})
    expect(stringifySearch(strip(scopeSchema.parse({})))).toBe('')
  })

  it('keeps params away from their defaults, and those with no default', () => {
    expect(
      strip(
        scopeSchema.parse({
          endpoint: 'gpt-openai',
          maxInput: 2.5,
          model: ['openai/gpt-5'],
          plot: false,
          sort: '-blend',
          unlisted: true,
          with: ['tools'],
        }),
      ),
    ).toEqual({
      endpoint: 'gpt-openai',
      maxInput: 2.5,
      model: ['openai/gpt-5'],
      plot: false,
      sort: '-blend',
      unlisted: true,
      with: ['tools'],
    })
  })

  it('strips only the defaults from a mixed scope', () => {
    expect(
      stringifySearch(strip(scopeSchema.parse({ model: 'a', plot: true, sort: 'input' }))),
    ).toBe('?model=a')
  })
})

describe('filter updates', () => {
  it('toggles list values', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('moves a property between included, excluded, and off', () => {
    const included = setPropertyState({ with: [], without: ['tools'] }, 'tools', 'with')

    expect(included).toEqual({ with: ['tools'], without: [] })
    expect(propertyState(included, 'tools')).toBe('with')
    expect(setPropertyState(included, 'tools', 'without')).toEqual({ with: [], without: ['tools'] })
    expect(propertyState(setPropertyState(included, 'tools', 'off'), 'tools')).toBe('off')
  })

  it('counts each list value, bound, and the unlisted toggle', () => {
    expect(activeFilterCount(clearedFilters)).toBe(0)
    expect(
      activeFilterCount({
        ...clearedFilters,
        maxInput: 1,
        model: ['a', 'b'],
        unlisted: true,
        without: ['zdr'],
      }),
    ).toBe(5)
  })
})
