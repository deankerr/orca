import { stripSearchParams } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { stringifySearch } from '#lib/search'

import type { EndpointSearch } from './search'
import {
  activeFilterCount,
  clearedFilters,
  endpointSearchDefaults,
  endpointSearchSchema,
  parseSortKey,
  propertyState,
  setPropertyState,
  toggleValue,
  toSortKey,
} from './search'

describe('endpointSearchSchema', () => {
  it('fills defaults for a bare URL', () => {
    expect(endpointSearchSchema.parse({})).toEqual(endpointSearchDefaults)
  })

  it('splits comma lists, including single values the router parsed as other types', () => {
    expect(
      endpointSearchSchema.parse({ model: 'openai/gpt-5,openai/gpt-5:free', provider: ['azure'] }),
    ).toMatchObject({
      model: ['openai/gpt-5', 'openai/gpt-5:free'],
      provider: ['azure'],
    })
    expect(endpointSearchSchema.parse({ provider: 302 }).provider).toEqual(['302'])
    expect(endpointSearchSchema.parse({ model: 'a,,a,b' }).model).toEqual(['a', 'b'])
  })

  it('reads bounds, windows, toggles, sort, and selection', () => {
    expect(
      endpointSearchSchema.parse({
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
      endpointSearchSchema.parse({
        endpoint: '',
        maxInput: -1,
        minTps: 'fast',
        model: { nested: true },
        plot: 'yes',
        released: 2,
        sort: 'price',
        unlisted: 1,
      }),
    ).toEqual(endpointSearchDefaults)
  })

  it('drops unknown properties and lets an included property win over its exclusion', () => {
    expect(endpointSearchSchema.parse({ with: 'tools,bogus', without: 'tools,zdr' })).toMatchObject(
      {
        with: ['tools'],
        without: ['zdr'],
      },
    )
  })
})

describe('stripping defaults from URLs', () => {
  const strip = (search: EndpointSearch) =>
    z
      .looseObject({})
      .parse(stripSearchParams(endpointSearchDefaults)({ next: (next) => next, search }))

  it('removes every param at its default', () => {
    expect(strip(endpointSearchSchema.parse({}))).toEqual({})
    expect(stringifySearch(strip(endpointSearchSchema.parse({})))).toBe('')
  })

  it('keeps params away from their defaults, and those with no default', () => {
    expect(
      strip(
        endpointSearchSchema.parse({
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

  it('strips only the defaults from a mixed search', () => {
    expect(
      stringifySearch(strip(endpointSearchSchema.parse({ model: 'a', plot: true, sort: 'input' }))),
    ).toBe('?model=a')
  })
})

describe('sort keys', () => {
  it('prefix descending columns with a minus', () => {
    expect(parseSortKey('-blend')).toEqual({ column: 'blend', descending: true })
    expect(parseSortKey('input')).toEqual({ column: 'input', descending: false })
    expect(toSortKey('throughput', true)).toBe('-throughput')
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
